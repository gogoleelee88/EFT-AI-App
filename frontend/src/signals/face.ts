/**
 * Face Signals Module
 * MediaPipe FaceLandmarker integration for facial analysis
 *
 * ⚠️ CONTRACT SIGNATURE - DO NOT CHANGE:
 * - FaceSignals type definition
 * - Function signatures must remain compatible
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * ⚠️ CONTRACT TYPE - DO NOT MODIFY
 * Facial analysis signals from MediaPipe
 */
export interface FaceSignals {
  blinkRate: number;     // Blinks per minute
  perclos: number;       // Percentage eye closure (0-1)
  head: {
    yaw: number;         // Head rotation left/right (-90 to 90)
    pitch: number;       // Head rotation up/down (-90 to 90)
    roll: number;        // Head tilt left/right (-90 to 90)
  };
  tension: number;       // Facial tension score (0-1)
  eyeOpen: number;       // Eye openness (0-1)
  quality: number;       // Signal quality (0-1)
}

/**
 * MediaPipe FaceLandmarker instance holder
 */
let faceLandmarker: FaceLandmarker | null = null;

/**
 * Blink detection state
 */
let blinkCount = 0;
let wasClosed = false;
let lastBlinkAt = 0;
let startTs = performance.now();
const perclosBuf: number[] = [];

/**
 * Initialize MediaPipe FaceLandmarker
 * Downloads WASM files and model on first call
 */
export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  return faceLandmarker;
}

/**
 * Analyze face from video frame
 * @param video - HTML video element with webcam stream
 * @param timestamp - Current timestamp in ms
 * @returns FaceSignals or null if no face detected
 */
export function analyzeFace(
  video: HTMLVideoElement,
  timestamp: number
): FaceSignals | null {
  if (!faceLandmarker) {
    console.warn("FaceLandmarker not initialized");
    return null;
  }

  try {
    const results = faceLandmarker.detectForVideo(video, timestamp);

    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      return null; // No face detected
    }

    const landmarks = results.faceLandmarks[0];
    const blendshapes = results.faceBlendshapes?.[0];
    const matrix = results.facialTransformationMatrixes?.[0];

    // Calculate signals from landmarks and blendshapes - 개선된 버전
    const signals: FaceSignals = {
      blinkRate: calculateBlinkRate(landmarks), // landmarks 사용
      perclos: calculatePerclos(landmarks, blendshapes), // landmarks 추가
      head: calculateHeadPose(matrix),
      tension: calculateTension(blendshapes),
      eyeOpen: calculateEyeOpen(landmarks), // landmarks 사용
      quality: calculateQuality(landmarks),
    };

    return signals;
  } catch (error) {
    console.error("Face analysis error:", error);
    return null;
  }
}

/**
 * Helper: Calculate distance between two points
 */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Calculate Eye Aspect Ratio (EAR) - 정방향
 */
function calculateEAR(
  landmarks: any,
  upperIdx: number,
  lowerIdx: number,
  leftIdx: number,
  rightIdx: number
): number {
  const upper = landmarks[upperIdx];
  const lower = landmarks[lowerIdx];
  const left = landmarks[leftIdx];
  const right = landmarks[rightIdx];

  const vert = dist(upper, lower);
  const horiz = dist(left, right);

  return vert / Math.max(1e-6, horiz); // EAR: 작을수록 눈 감김
}

/**
 * Calculate blink rate from landmarks - 개선된 실시간 감지
 */
function calculateBlinkRate(landmarks: any): number {
  if (!landmarks || landmarks.length === 0) return 15;

  // MediaPipe 468-point landmark indices (approximate)
  // Left eye: 159 (upper), 145 (lower), 33 (left corner), 133 (right corner)
  // Right eye: 386 (upper), 374 (lower), 263 (left corner), 362 (right corner)

  const earLeft = calculateEAR(landmarks, 159, 145, 33, 133);
  const earRight = calculateEAR(landmarks, 386, 374, 263, 362);
  const earAvg = (earLeft + earRight) / 2;

  // Threshold for closed eyes (calibrated)
  const CLOSED = earAvg < 0.20;

  // Blink detection: open->close->open cycle
  const now = performance.now();
  if (CLOSED && !wasClosed && now - lastBlinkAt > 120) {
    wasClosed = true;
  } else if (!CLOSED && wasClosed) {
    wasClosed = false;
    if (now - lastBlinkAt > 120) {
      blinkCount++;
      lastBlinkAt = now;
    }
  }

  const minutes = Math.max(1 / 60, (now - startTs) / 60000);
  return blinkCount / minutes;
}

/**
 * Calculate PERCLOS (percentage eye closure) - 개선된 버전
 */
function calculatePerclos(landmarks: any, blendshapes: any): number {
  if (!landmarks || landmarks.length === 0) return 0;

  const earLeft = calculateEAR(landmarks, 159, 145, 33, 133);
  const earRight = calculateEAR(landmarks, 386, 374, 263, 362);
  const earAvg = (earLeft + earRight) / 2;

  const CLOSED = earAvg < 0.20 ? 1 : 0;

  // PERCLOS: 최근 60프레임(~2초) 창에서 닫힘 비율
  perclosBuf.push(CLOSED);
  if (perclosBuf.length > 60) {
    perclosBuf.shift();
  }

  return perclosBuf.reduce((a, b) => a + b, 0) / Math.max(1, perclosBuf.length);
}

/**
 * Calculate head pose angles from transformation matrix
 */
function calculateHeadPose(matrix: any): { yaw: number; pitch: number; roll: number } {
  if (!matrix?.data) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Extract rotation from transformation matrix
  // TODO: Implement proper matrix decomposition
  return {
    yaw: 0,   // Left/right rotation
    pitch: 0, // Up/down rotation
    roll: 0,  // Tilt rotation
  };
}

/**
 * Calculate facial tension from blendshapes
 */
function calculateTension(blendshapes: any): number {
  if (!blendshapes?.categories) return 0;

  const jawOpen = blendshapes.categories.find(
    (c: any) => c.categoryName === "jawOpen"
  )?.score ?? 0;

  const browDown = blendshapes.categories.find(
    (c: any) => c.categoryName === "browDownLeft"
  )?.score ?? 0;

  // Higher jaw tension + brow tension = higher tension score
  return Math.min((1 - jawOpen) * 0.5 + browDown * 0.5, 1);
}

/**
 * Calculate eye openness - EAR 기반
 */
function calculateEyeOpen(landmarks: any): number {
  if (!landmarks || landmarks.length === 0) return 1;

  const earLeft = calculateEAR(landmarks, 159, 145, 33, 133);
  const earRight = calculateEAR(landmarks, 386, 374, 263, 362);
  const earAvg = (earLeft + earRight) / 2;

  // 0.15~0.30 범위를 0~1로 정규화
  return Math.min(1, Math.max(0, (earAvg - 0.15) / 0.15));
}

/**
 * Calculate signal quality based on landmark confidence
 */
function calculateQuality(landmarks: any): number {
  if (!landmarks || landmarks.length === 0) return 0;

  // Average z-coordinate confidence (closer to 0 = better quality)
  const avgZ = landmarks.reduce((sum: number, lm: any) => sum + Math.abs(lm.z || 0), 0) / landmarks.length;

  return Math.max(0, 1 - avgZ * 5); // Convert to 0-1 quality score
}

/**
 * Cleanup MediaPipe resources
 */
export function cleanupFaceLandmarker(): void {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
}
