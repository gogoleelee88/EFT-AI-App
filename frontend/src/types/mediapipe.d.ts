// MediaPipe 타입 정의
declare module '@mediapipe/pose' {
  export class Pose {
    constructor(config: {
      locateFile: (file: string) => string;
    });
    setOptions(options: {
      modelComplexity?: number;
      smoothLandmarks?: boolean;
      enableSegmentation?: boolean;
      minDetectionConfidence?: number;
      minTrackingConfidence?: number;
    }): void;
    onResults(cb: (results: any) => void): void;
    send(input: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
  }
}

declare module '@mediapipe/face_mesh' {
  export class FaceMesh {
    constructor(config: {
      locateFile: (file: string) => string;
    });
    setOptions(options: {
      maxNumFaces?: number;
      refineLandmarks?: boolean;
      minDetectionConfidence?: number;
      minTrackingConfidence?: number;
    }): void;
    onResults(cb: (results: any) => void): void;
    send(input: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
  }
}

declare module '@mediapipe/hands' {
  export class Hands {
    constructor(config: {
      locateFile: (file: string) => string;
    });
    setOptions(options: {
      maxNumHands?: number;
      modelComplexity?: number;
      minDetectionConfidence?: number;
      minTrackingConfidence?: number;
    }): void;
    onResults(cb: (results: any) => void): void;
    send(input: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
  }
}

declare module '@mediapipe/camera_utils' {
  export class Camera {
    constructor(videoElement: HTMLVideoElement, config: {
      onFrame: () => Promise<void> | void;
      width?: number;
      height?: number;
    });
    start(): Promise<void>;
    stop(): void;
  }
}