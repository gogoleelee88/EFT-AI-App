// 하이브리드 행동 인식 엔진
// Step1: 사용자 정의 패턴 매칭 → Step2: 기본 모델(TFLite) → Step3: Unknown_Activity

const fs = require('fs');
const eventBus = require('./eventBus');
const { logEvent } = require('../storage/eventsRepo');
const { loadCustomPatterns, addCustomPattern } = require('../storage/customPatternsRepo');

// 메모리 캐시: Unknown_Activity 에서 생성된 시그니처 임시 저장
const pendingUnknown = new Map(); // bufferId -> { signature, createdAt }

/**
 * 단순 시그니처 구조
 * @typedef {Object} Signature
 * @property {number} length
 * @property {number} featureDim
 * @property {number[][]} samples
 * @property {number} [durationMs]
 */

/**
 * ActivityBuffer 구조 (sensors/index.js 에서 emit)
 * @typedef {Object} ActivityBuffer
 * @property {number} startedAt
 * @property {number} durationMs
 * @property {{ tOffsetMs:number, features:number[] }[]} samples
 */

/**
 * snapshot 기반 간단 시그니처 생성 (MVP)
 * 향후에는 센서 기반 ActivityBuffer → 시그니처로 확장 가능.
 * @param {{ ts:number, stuck_conf:number, fatigue_score:number, attention_score:number }} snapshot
 * @returns {Signature}
 */
function snapshotToSignature(snapshot) {
  const features = [
    Number.isFinite(snapshot.stuck_conf) ? snapshot.stuck_conf : 0,
    Number.isFinite(snapshot.fatigue_score) ? snapshot.fatigue_score : 0,
    Number.isFinite(snapshot.attention_score) ? snapshot.attention_score : 0,
  ];
  const length = 16;
  const samples = Array.from({ length }, () => [...features]);
  return {
    length,
    featureDim: features.length,
    samples,
    durationMs: 60 * 1000,
  };
}

/**
 * ActivityBuffer → Signature (고정 길이 resampling)
 * @param {ActivityBuffer} buffer
 * @param {number} [targetSteps]
 * @returns {Signature}
 */
function bufferToSignature(buffer, targetSteps = 32) {
  const samples = buffer.samples || [];
  if (!samples.length) {
    return {
      length: targetSteps,
      featureDim: 0,
      samples: Array.from({ length: targetSteps }, () => []),
      durationMs: buffer.durationMs,
    };
  }

  const featureDim = samples[0].features.length;
  const stepDuration = buffer.durationMs / targetSteps;
  const result = [];

  for (let i = 0; i < targetSteps; i++) {
    const tStart = i * stepDuration;
    const tEnd = (i + 1) * stepDuration;
    const bucket = samples.filter((s) => s.tOffsetMs >= tStart && s.tOffsetMs < tEnd);

    const avg = new Array(featureDim).fill(0);
    if (bucket.length > 0) {
      for (const s of bucket) {
        for (let d = 0; d < featureDim; d++) {
          avg[d] += s.features[d] || 0;
        }
      }
      for (let d = 0; d < featureDim; d++) {
        avg[d] /= bucket.length;
      }
    }
    result.push(avg);
  }

  return {
    length: targetSteps,
    featureDim,
    samples: result,
    durationMs: buffer.durationMs,
  };
}

function cosineSimilarity(sigA, sigB) {
  if (!sigA || !sigB) return 0;
  if (sigA.length !== sigB.length || sigA.featureDim !== sigB.featureDim) return 0;

  const flatA = [];
  const flatB = [];
  for (let i = 0; i < sigA.length; i++) {
    for (let j = 0; j < sigA.featureDim; j++) {
      flatA.push(sigA.samples[i][j] || 0);
      flatB.push(sigB.samples[i][j] || 0);
    }
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let k = 0; k < flatA.length; k++) {
    const a = flatA[k];
    const b = flatB[k];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Step1: 사용자 정의 패턴 매칭
 * @param {Signature} sig
 */
function matchCustomPatterns(sig) {
  const patterns = loadCustomPatterns();
  let best = null;

  for (const p of patterns) {
    if (!p.signature) continue;
    const score = cosineSimilarity(sig, p.signature);
    if (!best || score > best.score) {
      best = { pattern: p, score };
    }
  }

  if (best && best.score >= 0.85) {
    return {
      stage: 'custom',
      label: best.pattern.name,
      patternId: best.pattern.id,
      score: best.score,
    };
  }
  return null;
}

// --- Step2: 기본 모델 (Node 내 TFLite, 없으면 자동 폴백) ---

let localTfliteModel = null;
let localTfliteLabels = [];
let localTfliteInitialized = false;

/**
 * Node 내 TFLite 런타임/모델 로드 (A안)
 *
 * - 기본값: 환경변수로 경로 지정
 *   - RESUME_OS_TFLITE_MODEL=/absolute/path/to/model.tflite
 *   - RESUME_OS_TFLITE_LABELS=/absolute/path/to/labels.json (["Focus","Browse",...])
 *
 * - 아직 tflite-node 같은 런타임을 설치하지 않았다면,
 *   여기서 require 에러만 로그로 남기고, 아래 runBaseModelLocal 에서 null 을 리턴한다.
 */
function initLocalTfliteIfNeeded() {
  if (localTfliteInitialized) return;
  localTfliteInitialized = true;

  const modelPath = process.env.RESUME_OS_TFLITE_MODEL;
  const labelsPath = process.env.RESUME_OS_TFLITE_LABELS;
  if (!modelPath || !labelsPath) {
    console.warn(
      '[activityRecognizer] Local TFLite 비활성화: RESUME_OS_TFLITE_MODEL / RESUME_OS_TFLITE_LABELS 환경변수를 설정하세요.'
    );
    return;
  }

  try {
    // node-tflite 런타임 사용 (npm install node-tflite 필요)
    // https://github.com/seanchas116/node-tflite
    // eslint-disable-next-line global-require
    const { Interpreter } = require('node-tflite');
    const modelBuffer = fs.readFileSync(modelPath);
    localTfliteModel = new Interpreter(modelBuffer);
    localTfliteModel.allocateTensors();

    // 라벨 로드 (절대 경로 지원)
    const labelsRaw = fs.readFileSync(labelsPath, 'utf8');
    const parsed = JSON.parse(labelsRaw);
    localTfliteLabels = Array.isArray(parsed) ? parsed : [];
    if (!localTfliteLabels.length) {
      console.warn('[activityRecognizer] TFLite labels 파일이 비어 있거나 배열이 아닙니다.');
    }

    console.log(
      '[activityRecognizer] Local TFLite 초기화 완료:',
      'input dims =',
      localTfliteModel.inputs[0]?.dims,
      'output dims =',
      localTfliteModel.outputs[0]?.dims
    );
  } catch (e) {
    console.error('[activityRecognizer] Local TFLite 초기화 실패:', e.message || e);
    localTfliteModel = null;
    localTfliteLabels = [];
  }
}

/**
 * Signature → 1차원 float 배열로 펼치기
 */
function flattenSignature(sig) {
  const arr = [];
  for (let i = 0; i < sig.length; i++) {
    for (let j = 0; j < sig.featureDim; j++) {
      arr.push(sig.samples[i][j] || 0);
    }
  }
  return new Float32Array(arr);
}

/**
 * Step2: 기본 모델 (Local TFLite, 현재는 스켈레톤)
 *
 * @param {Signature} sig
 * @returns {{ label:string; confidence:number } | null}
 */
function runBaseModel(sig) {
  initLocalTfliteIfNeeded();

  // 런타임/모델이 준비되지 않은 경우 → 사용하지 않고 null 반환
  if (!localTfliteModel || !localTfliteLabels.length) {
    return null;
  }

  try {
    const inputTensor = localTfliteModel.inputs[0];
    const inputDims = inputTensor.dims; // 예: [1, 80, 3]
    const inputSize = inputDims.reduce((a, b) => a * b, 1);

    const flat = flattenSignature(sig);
    if (flat.length !== inputSize) {
      console.warn(
        '[activityRecognizer] runBaseModel: signature length mismatch',
        'sigLen =',
        flat.length,
        'expected =',
        inputSize,
        'dims =',
        inputDims
      );
      return null;
    }

    const inputData = new Float32Array(inputSize);
    inputData.set(flat);
    inputTensor.copyFrom(inputData);

    localTfliteModel.invoke();

    const outputTensor = localTfliteModel.outputs[0];
    const outputDims = outputTensor.dims; // 예: [1, numClasses]
    const outputSize = outputDims.reduce((a, b) => a * b, 1);
    const outputData = new Float32Array(outputSize);
    outputTensor.copyTo(outputData);

    // Keras 모델이 마지막에 softmax를 쓰므로 outputData 는 이미 확률 분포라고 가정
    let bestIdx = 0;
    for (let i = 1; i < outputData.length; i++) {
      if (outputData[i] > outputData[bestIdx]) {
        bestIdx = i;
      }
    }
    const confidence = outputData[bestIdx];
    const label = localTfliteLabels[bestIdx] || `class_${bestIdx}`;

    return { label, confidence };
  } catch (e) {
    console.error('[activityRecognizer] runBaseModel(Local TFLite) 오류:', e.message || e);
    return null;
  }
}

/**
 * Signature 기반 공통 인식 로직
 * (Step1: custom, Step2: base model, Step3: Unknown)
 *
 * @param {Signature} sig
 * @param {{ ts?:number, state?:string }} [meta]
 */
function recognizeFromSignature(sig, meta) {
  const ts = meta?.ts || Date.now();
  const state = meta?.state || 'UNKNOWN';

  // Step1: 사용자 정의 패턴
  const custom = matchCustomPatterns(sig);
  if (custom) {
    logEvent(
      'ACTIVITY_RECOG',
      { stage: 'custom', label: custom.label, score: custom.score, ts, state },
      custom.score
    );
    return custom;
  }

  // Step2: 기본 모델 (Local TFLite 스켈레톤)
  const base = runBaseModel(sig);
  if (base) {
    logEvent(
      'ACTIVITY_RECOG',
      { stage: 'base_model', label: base.label, score: base.confidence, ts, state },
      base.confidence
    );
    return {
      stage: 'base_model',
      label: base.label,
      score: base.confidence,
    };
  }

  // Step3: Unknown 처리
  const bufferId = `b_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  pendingUnknown.set(bufferId, {
    signature: sig,
    createdAt: Date.now(),
  });

  const payload = {
    bufferId,
    ts,
    state,
  };

  logEvent('UNKNOWN_ACTIVITY', payload, 0.0);
  eventBus.emit('unknown-activity', payload);

  return {
    stage: 'unknown',
    label: 'Unknown_Activity',
    score: 0,
    bufferId,
  };
}

/**
 * 스냅샷 기반 행동 인식 메인 함수
 * @param {{ ts:number, state:string, stuck_conf:number, fatigue_score:number, attention_score:number }} snapshot
 * @returns {{ stage:string, label:string, score:number, patternId?:string, bufferId?:string }}
 */
function recognizeActivityFromSnapshot(snapshot) {
  const sig = snapshotToSignature(snapshot);
  return recognizeFromSignature(sig, { ts: snapshot.ts, state: snapshot.state });
}

/**
 * ActivityBuffer 기반 행동 인식 함수
 * @param {ActivityBuffer} buffer
 */
function recognizeActivityFromBuffer(buffer) {
  const sig = bufferToSignature(buffer);
  return recognizeFromSignature(sig, { ts: buffer.startedAt, state: 'UNKNOWN' });
}

/**
 * Unknown_Activity 에서 생성된 버퍼를 사용자 정의 패턴으로 등록
 * @param {{ bufferId:string, name:string, description?:string }} input
 */
function registerCustomPatternFromUnknown(input) {
  const { bufferId, name, description } = input || {};
  if (!bufferId || !name) {
    throw new Error('bufferId와 name은 필수입니다.');
  }
  const entry = pendingUnknown.get(bufferId);
  if (!entry) {
    throw new Error('해당 bufferId를 찾을 수 없습니다(이미 만료되었을 수 있음).');
  }

  const pattern = addCustomPattern({
    name,
    description,
    signature: entry.signature,
  });

  pendingUnknown.delete(bufferId);
  logEvent('CUSTOM_ACTIVITY_REGISTERED', { patternId: pattern.id, name }, 1.0);
  return pattern;
}

module.exports = {
  recognizeActivityFromSnapshot,
  recognizeActivityFromBuffer,
  registerCustomPatternFromUnknown,
};

