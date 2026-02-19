/**
 * Context-aware Signal Processor (2026 Upgrade)
 * - Kalman filter for face mesh jitter reduction
 * - Calibration phase: baseline_tension, delta-based tension
 * - Luminance check for auto-illumination UI
 *
 * Contract: FaceSignals 타입/시그니처는 유지; 이 계층에서만 가공.
 */

import type { FaceSignals } from './face';

/** 1D Kalman filter (tension, perclos 등 스칼라 신호 노이즈 제거) */
export class KalmanFilter1D {
  private x: number;
  private P: number;
  private readonly Q: number; // process noise
  private readonly R: number; // measurement noise

  constructor(initialValue = 0.5, Q = 0.01, R = 0.08) {
    this.x = initialValue;
    this.P = 1;
    this.Q = Q;
    this.R = R;
  }

  update(measurement: number): number {
    const xPred = this.x;
    const PPred = this.P + this.Q;
    const K = PPred / (PPred + this.R);
    this.x = xPred + K * (measurement - xPred);
    this.P = (1 - K) * PPred;
    return this.x;
  }

  reset(value: number): void {
    this.x = value;
    this.P = 1;
  }
}

/** Calibration + Delta 기반 긴장 판단 */
export interface CalibrationState {
  phase: 'calibrating' | 'done';
  baseline_tension: number;
  samples: number[];
  startedAt: number;
}

const DEFAULT_CALIBRATION_MS = 8000; // 5~10초 → 8초 기본
const DELTA_THRESHOLD_TENSE = 0.2;   // current - baseline > 0.2 → 긴장
const DELTA_THRESHOLD_ANXIOUS = 0.1; // > 0.1 → 불안

export function createCalibration(durationMs = DEFAULT_CALIBRATION_MS): CalibrationState {
  return {
    phase: 'calibrating',
    baseline_tension: 0.5,
    samples: [],
    startedAt: Date.now(),
  };
}

export function updateCalibration(
  state: CalibrationState,
  filteredTension: number,
  durationMs = DEFAULT_CALIBRATION_MS
): CalibrationState {
  if (state.phase === 'done') return state;

  const elapsed = Date.now() - state.startedAt;
  state.samples.push(filteredTension);
  const maxSamples = 80; // ~400ms * 80 ≈ 32s 상한
  if (state.samples.length > maxSamples) state.samples.shift();

  if (elapsed >= durationMs && state.samples.length >= 10) {
    const sorted = [...state.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      phase: 'done',
      baseline_tension: median,
      samples: state.samples,
      startedAt: state.startedAt,
    };
  }
  return state;
}

/** Delta 기준 긴장/불안 판별 (TO-BE) */
export function getTensionDeltaLabel(delta: number): '긴장' | '불안' | '보통' | '이완' {
  if (delta > DELTA_THRESHOLD_TENSE) return '긴장';
  if (delta > DELTA_THRESHOLD_ANXIOUS) return '불안';
  if (delta < -DELTA_THRESHOLD_ANXIOUS) return '이완';
  return '보통';
}

/** Processed output: FaceSignals + Kalman/Calibration 결과 */
export interface ProcessedFaceSignals extends FaceSignals {
  tension_filtered: number;
  tension_delta?: number;
  baseline_tension?: number;
  calibration_done: boolean;
}

export interface SignalProcessorConfig {
  calibrationDurationMs?: number;
  kalmanQ?: number;
  kalmanR?: number;
}

/**
 * SignalProcessor: Kalman + Calibration + (Luminance는 별도 함수)
 */
export class SignalProcessor {
  private kalmanTension: KalmanFilter1D;
  private calibration: CalibrationState;
  private readonly calibrationDurationMs: number;

  constructor(config: SignalProcessorConfig = {}) {
    const { calibrationDurationMs = DEFAULT_CALIBRATION_MS, kalmanQ = 0.01, kalmanR = 0.08 } = config;
    this.kalmanTension = new KalmanFilter1D(0.5, kalmanQ, kalmanR);
    this.calibration = createCalibration(calibrationDurationMs);
    this.calibrationDurationMs = calibrationDurationMs;
  }

  /** 한 프레임의 raw FaceSignals → ProcessedFaceSignals */
  process(raw: FaceSignals): ProcessedFaceSignals {
    const tensionFiltered = this.kalmanTension.update(raw.tension);
    this.calibration = updateCalibration(this.calibration, tensionFiltered, this.calibrationDurationMs);

    const calibrationDone = this.calibration.phase === 'done';
    const baseline = this.calibration.baseline_tension;
    const tensionDelta = calibrationDone ? tensionFiltered - baseline : undefined;

    return {
      ...raw,
      tension: raw.tension, // 원본 유지 (백엔드 호환)
      tension_filtered: tensionFiltered,
      tension_delta: tensionDelta,
      baseline_tension: calibrationDone ? baseline : undefined,
      calibration_done: calibrationDone,
    };
  }

  getCalibrationState(): CalibrationState {
    return this.calibration;
  }

  /** Calibration 리셋 (세션 재시작 시) */
  resetCalibration(): void {
    this.calibration = createCalibration(this.calibrationDurationMs);
    this.kalmanTension.reset(0.5);
  }
}

/**
 * 비디오 프레임 밝기 (0~1) — Auto-Illumination용
 * 같은 video를 canvas에 그린 뒤 중앙/전체 픽셀의 luminance 평균
 */
export function getLuminanceFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): number {
  if (video.readyState < 2 || video.videoWidth <= 0) return 0.5;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0.5;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  let sum = 0;
  const step = 4 * Math.max(1, Math.floor((w * h) / 2000)); // 서브샘플로 속도 확보
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const count = Math.floor(data.length / step);
  const luminance = sum / count / 255;
  return Math.max(0, Math.min(1, luminance));
}

/** 저조도 판단 (Auto-Illumination UI 전환용) */
export const LUMINANCE_LOW_THRESHOLD = 0.25;

export function isLowLight(luminance: number): boolean {
  return luminance < LUMINANCE_LOW_THRESHOLD;
}
