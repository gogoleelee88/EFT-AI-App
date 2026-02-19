import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';

type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

const IDX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const toDeg = (rad: number): number => (rad * 180) / Math.PI;

const safeVis = (lm: Landmark | undefined): number => {
  if (!lm) return 0;
  const vis = typeof lm.visibility === 'number' ? lm.visibility : 1;
  return clamp(vis);
};

const get = (landmarks: Landmark[], index: number): Landmark | undefined => landmarks[index];

export interface PostureData {
  posture_score: number;
  confidence: number;
  bad_posture_sec: number;
  neck_tilt_deg: number;
  shoulder_tilt_deg: number;
  torso_tilt_deg: number;
  timestamp: number;
  cue?: string;
}

function cueFor(shoulderTilt: number, torsoTilt: number, neckTilt: number): string {
  if (Math.abs(shoulderTilt) >= 8) {
    return '어깨 높이를 좌우 비슷하게 맞춰볼까요?';
  }
  if (Math.abs(torsoTilt) >= 10) {
    return '상체를 살짝 세우고 호흡 공간을 넓혀볼까요?';
  }
  if (Math.abs(neckTilt) >= 10) {
    return '턱을 살짝 당기고 시선을 정면에 둘까요?';
  }
  return '어깨 힘을 천천히 내려보고 편한 축을 찾아볼까요?';
}

export function poseResultToPostureData(
  result: PoseLandmarkerResult | null,
  prev: PostureData | null,
  sampleSec = 0.4
): PostureData | null {
  const landmarks = result?.landmarks?.[0] as Landmark[] | undefined;
  if (!landmarks || landmarks.length < 25) return null;

  const nose = get(landmarks, IDX.nose);
  const ls = get(landmarks, IDX.leftShoulder);
  const rs = get(landmarks, IDX.rightShoulder);
  const lh = get(landmarks, IDX.leftHip);
  const rh = get(landmarks, IDX.rightHip);
  if (!nose || !ls || !rs || !lh || !rh) return null;

  const confidence = clamp(
    (safeVis(nose) + safeVis(ls) + safeVis(rs) + safeVis(lh) + safeVis(rh)) / 5
  );

  const shoulderMidX = (ls.x + rs.x) / 2;
  const shoulderMidY = (ls.y + rs.y) / 2;
  const hipMidX = (lh.x + rh.x) / 2;
  const hipMidY = (lh.y + rh.y) / 2;

  const shoulderTiltDeg = toDeg(Math.atan2(ls.y - rs.y, ls.x - rs.x));
  const torsoTiltDeg = toDeg(Math.atan2(shoulderMidX - hipMidX, Math.abs(hipMidY - shoulderMidY)));
  const neckTiltDeg = toDeg(Math.atan2(nose.x - shoulderMidX, Math.abs(nose.y - shoulderMidY)));

  const shoulderPenalty = clamp(Math.abs(shoulderTiltDeg) / 20);
  const torsoPenalty = clamp(Math.abs(torsoTiltDeg) / 20);
  const neckPenalty = clamp(Math.abs(neckTiltDeg) / 20);
  const postureScore = clamp(1 - (0.4 * shoulderPenalty + 0.35 * torsoPenalty + 0.25 * neckPenalty));

  const isBad = postureScore < 0.58 || Math.abs(torsoTiltDeg) >= 12 || Math.abs(shoulderTiltDeg) >= 10;
  const prevBadSec = prev?.bad_posture_sec ?? 0;
  const badPostureSec = isBad
    ? prevBadSec + sampleSec
    : Math.max(0, prevBadSec - sampleSec * 0.5);

  const payload: PostureData = {
    posture_score: Number(postureScore.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    bad_posture_sec: Number(badPostureSec.toFixed(2)),
    neck_tilt_deg: Number(neckTiltDeg.toFixed(2)),
    shoulder_tilt_deg: Number(shoulderTiltDeg.toFixed(2)),
    torso_tilt_deg: Number(torsoTiltDeg.toFixed(2)),
    timestamp: Date.now(),
  };
  if (isBad) {
    payload.cue = cueFor(shoulderTiltDeg, torsoTiltDeg, neckTiltDeg);
  }
  return payload;
}
