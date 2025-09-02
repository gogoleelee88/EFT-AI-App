// 메인 컴포넌트
export { default as ARSession } from './components/ARSession';
export { default as ARSessionSimple } from './components/ARSessionSimple';
export { default as Calibration } from './components/Calibration';
export { default as FramingOverlay } from './components/FramingOverlay';
export { default as OverlayCanvas } from './components/OverlayCanvas';
export { default as PermissionGate } from './components/PermissionGate';
export { default as Countdown } from './components/Countdown';
export { default as GuideBox } from './components/GuideBox';

// 훅
export { useCamera } from './useCamera';
export { usePose } from './usePose';
export { useSmoothing } from './useSmoothing';
export { useStepPlayer } from './components/StepPlayer';

// 유틸리티
export { mapEFTPoint } from './eft-mapping';
export { drawMarker, drawLabel, drawTip, drawCountdown } from './utils/draw';
export { ttsService } from './utils/audio';

// 타입
export type { 
  EFTPoint, 
  Side, 
  EFTStep, 
  EFTSessionPlan, 
  XY, 
  Pose 
} from './types';

// 설정
export { AR } from './ar-config';