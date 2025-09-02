import type { EFTPoint, Side, XY, Pose } from "./types";

// BlazePose 랜드마크 인덱스 (주요 포인트만)
const POSE_LANDMARKS = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftMouth: 9,
  rightMouth: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

function lerp(a: XY, b: XY, t: number): XY {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    vis: Math.min(a.vis || 1, b.vis || 1)
  };
}

function distance(a: XY, b: XY): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function offsetPoint(point: XY, offsetX: number = 0, offsetY: number = 0): XY {
  return {
    x: point.x + offsetX,
    y: point.y + offsetY,
    vis: point.vis
  };
}

export function mapEFTPoint(pose: Pose, point: EFTPoint, side: Side): XY | null {
  const landmarks = pose.landmarks;
  if (!landmarks || landmarks.length < 25) return null;

  const nose = landmarks[POSE_LANDMARKS.nose];
  const leftEye = landmarks[POSE_LANDMARKS.leftEye];
  const rightEye = landmarks[POSE_LANDMARKS.rightEye];
  const leftEar = landmarks[POSE_LANDMARKS.leftEar];
  const rightEar = landmarks[POSE_LANDMARKS.rightEar];
  const leftShoulder = landmarks[POSE_LANDMARKS.leftShoulder];
  const rightShoulder = landmarks[POSE_LANDMARKS.rightShoulder];
  const leftHip = landmarks[POSE_LANDMARKS.leftHip];
  const rightHip = landmarks[POSE_LANDMARKS.rightHip];

  // 얼굴 너비 추정 (눈 사이 거리)
  const faceWidth = leftEye && rightEye ? distance(leftEye, rightEye) : 0.08;

  switch (point) {
    case "brow": {
      const eyeBase = side === "left" ? leftEye : 
                     side === "right" ? rightEye : 
                     (leftEye && rightEye) ? lerp(leftEye, rightEye, 0.5) : null;
      
      if (!eyeBase) return null;
      return offsetPoint(eyeBase, 0, -faceWidth * 0.5); // 눈 위쪽으로
    }

    case "side_eye": {
      const eye = side === "left" ? leftEye : rightEye;
      const ear = side === "left" ? leftEar : rightEar;
      
      if (!eye || !ear) return null;
      return lerp(eye, ear, 0.35); // 눈에서 귀 방향으로 35%
    }

    case "under_eye": {
      const eyeBase = side === "left" ? leftEye : 
                     side === "right" ? rightEye : 
                     (leftEye && rightEye) ? lerp(leftEye, rightEye, 0.5) : null;
      
      if (!eyeBase) return null;
      return offsetPoint(eyeBase, 0, faceWidth * 0.35); // 눈 아래쪽으로
    }

    case "under_nose": {
      if (!nose) return null;
      return offsetPoint(nose, 0, faceWidth * 0.35); // 코 아래쪽으로
    }

    case "chin": {
      if (!nose) return null;
      return offsetPoint(nose, 0, faceWidth * 0.9); // 코에서 더 아래로 (턱 위치)
    }

    case "clavicle": {
      if (!leftShoulder || !rightShoulder) return null;
      return lerp(leftShoulder, rightShoulder, 0.5); // 쇄골 중앙
    }

    case "under_arm": {
      const shoulder = side === "left" ? leftShoulder : rightShoulder;
      const hip = side === "left" ? leftHip : rightHip;
      
      if (!shoulder || !hip) return null;
      return lerp(shoulder, hip, 0.25); // 어깨에서 힙 방향으로 25%
    }

    case "top_head": {
      if (!leftEye || !rightEye || !nose) return null;
      const midEye = lerp(leftEye, rightEye, 0.5);
      return offsetPoint(midEye, 0, -faceWidth * 1.2); // 눈 중간에서 위로
    }

    default:
      return null;
  }
}