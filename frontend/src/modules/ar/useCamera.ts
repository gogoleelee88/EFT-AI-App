import { useCallback, useRef, useState } from 'react';

export interface CameraConfig {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
}

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async (
    videoElement: HTMLVideoElement,
    config: CameraConfig = { width: 640, height: 480, facingMode: 'user' }
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: config.facingMode,
          width: config.width,
          height: config.height
        },
        audio: false
      });

      videoElement.srcObject = stream;
      await videoElement.play();
      
      streamRef.current = stream;
      setIsActive(true);
      setError(null);
      
      return stream;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Camera access failed';
      setError(errorMsg);
      throw err;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsActive(false);
    }
  }, []);

  return {
    startCamera,
    stopCamera,
    isActive,
    error,
    stream: streamRef.current
  };
}