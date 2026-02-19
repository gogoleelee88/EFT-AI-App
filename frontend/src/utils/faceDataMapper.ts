/**
 * FaceSignals → face_data 변환 (멀티모달 설계 §4)
 * Context-aware: calibration_done이면 tension_delta 기준으로 감정 판별 (TO-BE)
 */
import type { FaceSignals } from '../signals/face';
import type { ProcessedFaceSignals } from '../signals/SignalProcessor';
import { getTensionDeltaLabel } from '../signals/SignalProcessor';

export interface FaceData {
  dominant_emotion?: string;
  intensity?: number;
  tension?: number;
  perclos?: number;
  /** Context-aware: Kalman 필터 후 값 (백엔드 선택 사용) */
  tension_filtered?: number;
  /** Calibration 후 baseline 대비 변화량 */
  tension_delta?: number;
  baseline_tension?: number;
  calibration_done?: boolean;
  arousal?: number;
  stress?: number;
  quality?: number;
  breath_rate?: number;
  heart_rate?: number;
  heart_rate_confidence?: number;
  timestamp?: number;
}

/** 호흡률 → arousal 보정 (설계 §4.2) */
function arousalCorrectionFromBreath(breathRate: number | undefined): number {
  if (breathRate == null) return 0;
  if (breathRate < 8) return 0.2;
  if (breathRate <= 14) return 0;
  if (breathRate > 20) return 0.3;
  return 0;
}

/** 심박 → arousal 보정 (설계 §4.3) */
function arousalCorrectionFromHeart(heartRate: number | undefined): number {
  if (heartRate == null) return 0;
  if (heartRate < 60) return -0.1;
  if (heartRate <= 80) return 0;
  if (heartRate <= 100) return 0.2;
  return 0.3;
}

/**
 * FaceSignals / ProcessedFaceSignals → face_data (백엔드 StrictIntakeInput.face_data).
 * - calibration_done && tension_delta 있으면 Delta 기준(TO-BE)으로 감정 판별.
 * - 없으면 기존 절대값(tension > 0.6 등) AS-IS 유지.
 */
export function faceSignalsToFaceData(
  face: FaceSignals | ProcessedFaceSignals,
  options?: { breath_rate?: number; heart_rate?: number; heart_rate_confidence?: number }
): FaceData {
  const { tension, perclos, eyeOpen, quality } = face;
  const processed = face as ProcessedFaceSignals;
  const useDelta =
    processed.calibration_done === true &&
    processed.tension_delta != null &&
    processed.baseline_tension != null;

  let dominant_emotion = '집중';
  let arousal = 0.5;
  const tensionForEmotion = useDelta ? processed.baseline_tension! + processed.tension_delta! : tension;

  if (useDelta) {
    const label = getTensionDeltaLabel(processed.tension_delta!);
    if (label === '긴장') {
      dominant_emotion = '긴장';
      arousal = 0.8;
    } else if (label === '불안') {
      dominant_emotion = '불안';
      arousal = 0.6;
    } else if (label === '이완' && perclos > 0.5) {
      dominant_emotion = '이완';
      arousal = 0.3;
    }
  } else {
    if (tension > 0.6) {
      dominant_emotion = '긴장';
      arousal = 0.8;
    } else if (tension > 0.4) {
      dominant_emotion = '불안';
      arousal = 0.6;
    } else if (tension < 0.4 && perclos > 0.5) {
      dominant_emotion = '이완';
      arousal = 0.3;
    }
  }

  arousal += arousalCorrectionFromBreath(options?.breath_rate);
  arousal += arousalCorrectionFromHeart(options?.heart_rate);
  arousal = Math.max(0, Math.min(1, arousal));

  const intensity = Math.round(tensionForEmotion * 10) / 10;
  const data: FaceData = {
    dominant_emotion,
    intensity: Math.min(1, Math.max(0, intensity)),
    tension,
    perclos,
    arousal,
    stress: tensionForEmotion,
    quality,
    timestamp: Date.now(),
  };
  if (processed.tension_filtered != null) data.tension_filtered = processed.tension_filtered;
  if (processed.tension_delta != null) data.tension_delta = processed.tension_delta;
  if (processed.baseline_tension != null) data.baseline_tension = processed.baseline_tension;
  if (processed.calibration_done != null) data.calibration_done = processed.calibration_done;
  if (options?.breath_rate != null) data.breath_rate = options.breath_rate;
  if (options?.heart_rate != null && (options?.heart_rate_confidence ?? 1) >= 0.4) {
    data.heart_rate = options.heart_rate;
    data.heart_rate_confidence = options.heart_rate_confidence;
  }
  return data;
}
