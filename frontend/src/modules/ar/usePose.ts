import { useCallback, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export function usePose() {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializePose = useCallback(async () => {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: '/models/pose_landmarker_lite.task',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      poseLandmarkerRef.current = poseLandmarker;
      setIsReady(true);
      setError(null);
      
      return poseLandmarker;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Pose detection initialization failed';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const detectPose = useCallback((
    videoElement: HTMLVideoElement,
    timestamp: number
  ): PoseLandmarkerResult | null => {
    if (!poseLandmarkerRef.current || !isReady) return null;
    
    try {
      return poseLandmarkerRef.current.detectForVideo(videoElement, timestamp);
    } catch (err) {
      console.error('Pose detection error:', err);
      return null;
    }
  }, [isReady]);

  const cleanup = useCallback(() => {
    if (poseLandmarkerRef.current) {
      poseLandmarkerRef.current.close();
      poseLandmarkerRef.current = null;
      setIsReady(false);
    }
  }, []);

  return {
    initializePose,
    detectPose,
    cleanup,
    isReady,
    error
  };
}