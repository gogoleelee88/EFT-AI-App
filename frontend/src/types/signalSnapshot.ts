export interface SignalSnapshot {
  tension_delta?: number;
  perclos?: number;
  quality?: number;
  timestamp: number;
  hr_trend?: number;
  posture_score?: number;
  face_detect_ratio?: number;
  fps?: number;
}

export interface SignalConfidenceResult {
  confidence: number;
  signal_degrade: boolean;
}

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export function computeSignalConfidence(snapshot: SignalSnapshot): SignalConfidenceResult {
  const quality = clamp(snapshot.quality ?? 0);
  const detectRatio = clamp(snapshot.face_detect_ratio ?? 0);
  const fps = Math.max(0, snapshot.fps ?? 0);
  const fpsScore = clamp(fps / 5);
  const confidence = clamp(0.55 * quality + 0.3 * detectRatio + 0.15 * fpsScore);
  const signalDegrade = confidence < 0.45 || quality < 0.35 || detectRatio < 0.35;
  return { confidence, signal_degrade: signalDegrade };
}
