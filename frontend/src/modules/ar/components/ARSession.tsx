import { useEffect, useRef, useState } from 'react';
import type { EFTSessionPlan } from '../types';
import { useCamera } from '../useCamera';
import { usePose } from '../usePose';
import { useSmoothing } from '../useSmoothing';
import { useStepPlayer } from './StepPlayer';
import { mapEFTPoint } from '../eft-mapping';
import { drawMarker, drawLabel, drawTip } from '../utils/draw';
import PermissionGate from './PermissionGate';
import Countdown from './Countdown';
import GuideBox from './GuideBox';

interface ARSessionProps {
  plan: EFTSessionPlan;
  autoPlay?: boolean;
  enableTTS?: boolean;
  enableSmoothing?: boolean;
  showGuide?: boolean;
}

export default function ARSession({ 
  plan, 
  autoPlay = true, 
  enableTTS = true,
  enableSmoothing = true,
  showGuide = true
}: ARSessionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuideBox, setShowGuideBox] = useState(showGuide);

  const camera = useCamera();
  const pose = usePose();
  const smoothing = useSmoothing(0.3);
  const player = useStepPlayer(plan, autoPlay, enableTTS);

  // AR 렌더링 루프
  useEffect(() => {
    if (!isReady || !pose.isReady || !player.currentStep) return;

    let animationId: number;

    const render = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 캔버스 크기 조정
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // 포즈 검출
      const timestamp = performance.now();
      const result = pose.detectPose(video, timestamp);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (result?.landmarks?.[0]) {
        const landmarks = result.landmarks[0];
        
        // EFT 포인트 계산
        const eftPoint = mapEFTPoint(
          { landmarks }, 
          player.currentStep.point, 
          player.currentStep.side
        );

        if (eftPoint) {
          // 스무딩 적용
          const smoothedPoint = enableSmoothing 
            ? smoothing.smooth(`${player.currentStep.point}_${player.currentStep.side}`, eftPoint)
            : eftPoint;

          if (smoothedPoint) {
            const x = smoothedPoint.x * canvas.width;
            const y = smoothedPoint.y * canvas.height;

            // 마커 그리기
            const pulseTime = (timestamp / 1000) % 1;
            drawMarker(ctx, x, y, undefined, pulseTime);
            
            // 라벨 그리기
            const label = `${player.currentStep.point} (${player.timeLeft}s)`;
            drawLabel(ctx, x, y, label);
          }
        }
      }

      // 팁 표시
      if (player.currentStep.tip) {
        drawTip(ctx, player.currentStep.tip, canvas.width);
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isReady, pose.isReady, player.currentStep, player.timeLeft, enableSmoothing, smoothing]);

  const handlePermissionGranted = async () => {
    try {
      const video = videoRef.current;
      if (!video) return;

      // 카메라 시작
      await camera.startCamera(video);
      
      // 포즈 검출 초기화
      await pose.initializePose();
      
      setIsReady(true);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'AR 세션 초기화 실패';
      setError(errorMsg);
    }
  };

  // 정리
  useEffect(() => {
    return () => {
      camera.stopCamera();
      pose.cleanup();
      smoothing.reset();
    };
  }, []);

  if (!isReady) {
    return (
      <PermissionGate onPermissionGranted={handlePermissionGranted}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>AR 세션을 준비하고 있습니다...</p>
          </div>
        </div>
      </PermissionGate>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto relative">
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-md">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* 메인 AR 화면 */}
      <div className="relative mx-auto rounded-xl overflow-hidden shadow-lg bg-black">
        <video
          ref={videoRef}
          className="w-full h-auto block"
          muted
          playsInline
          style={{ transform: 'scaleX(-1)' }} // 거울 효과
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ transform: 'scaleX(-1)' }} // 거울 효과
        />
        
        {/* 카운트다운 오버레이 */}
        <Countdown 
          count={player.timeLeft <= 3 ? player.timeLeft : 0}
          isVisible={player.isCountingDown}
        />
      </div>

      {/* 가이드 박스 */}
      {showGuideBox && player.currentStep && (
        <GuideBox
          currentPoint={player.currentStep.point}
          currentSide={player.currentStep.side}
          tip={player.currentStep.tip || null}
          stepNumber={player.stepIndex + 1}
          totalSteps={player.totalSteps}
          timeLeft={player.timeLeft}
          isVisible={showGuideBox}
          onClose={() => setShowGuideBox(false)}
        />
      )}

      {/* 컨트롤 패널 */}
      <div className="mt-6 p-4 bg-white rounded-lg shadow">
        {/* 세션 정보 */}
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold">{plan.title}</h3>
          <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-600">
            <span>스텝 {player.stepIndex + 1}/{player.totalSteps}</span>
            <span>•</span>
            <span>{player.currentStep?.point} ({player.currentStep?.side})</span>
            {player.currentStep?.tip && (
              <>
                <span>•</span>
                <span className="text-blue-600">{player.currentStep.tip}</span>
              </>
            )}
          </div>
        </div>

        {/* 진행 바 */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${player.progress * 100}%` }}
          />
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={player.prevStep}
            disabled={player.stepIndex === 0}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            이전
          </button>
          
          <button
            onClick={player.togglePlay}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {player.isPlaying ? '일시정지' : '재생'}
          </button>
          
          <button
            onClick={player.nextStep}
            disabled={player.stepIndex === player.totalSteps - 1}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>

        {/* 세션 완료 */}
        {player.isComplete && (
          <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-md text-center">
            <p className="text-green-700 font-semibold">세션이 완료되었습니다! 🎉</p>
            <button
              onClick={player.reset}
              className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              다시 시작
            </button>
          </div>
        )}
      </div>
    </div>
  );
}