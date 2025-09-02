import { useState, useRef, useEffect } from 'react';
import { useCamera } from '../useCamera';
import FramingOverlay from './FramingOverlay';

interface CalibrationProps {
  onReady: () => void;
  message?: string;
}

interface CalibrationStatus {
  distance: boolean;    // 거리 적절
  alignment: boolean;   // 정렬 상태
  lighting: boolean;    // 조명 상태
}

export default function Calibration({ onReady, message = "초록 박스에 상반신을 맞춰주세요" }: CalibrationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CalibrationStatus>({
    distance: false,
    alignment: false,
    lighting: false
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const camera = useCamera();

  // 카메라 초기화
  useEffect(() => {
    const initCamera = async () => {
      try {
        const video = videoRef.current;
        if (!video) return;

        await camera.startCamera(video, { width: 640, height: 480 });
        setIsReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : '카메라 초기화 실패');
      }
    };

    initCamera();
  }, [camera]);

  // 상태 체크 시뮬레이션
  useEffect(() => {
    if (!isReady) return;

    const checkStatus = () => {
      // 실제로는 MediaPipe로 포즈를 분석하여 판단
      // 여기서는 시간 기반 시뮬레이션
      const now = Date.now();
      const cycle = now % 8000; // 8초 사이클

      setStatus({
        distance: cycle > 1000,   // 1초 후 거리 OK
        alignment: cycle > 3000,  // 3초 후 정렬 OK
        lighting: cycle > 2000    // 2초 후 조명 OK
      });
    };

    const interval = setInterval(checkStatus, 100);
    return () => clearInterval(interval);
  }, [isReady]);

  // 모든 상태가 OK일 때 카운트다운 시작
  useEffect(() => {
    const allReady = status.distance && status.alignment && status.lighting;
    
    if (allReady && countdown === null) {
      setCountdown(3);
      
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timer);
            setTimeout(onReady, 100); // 약간의 딜레이 후 세션 시작
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else if (!allReady) {
      setCountdown(null);
    }
  }, [status, countdown, onReady]);

  const handleAlignmentChange = (aligned: boolean) => {
    setStatus(prev => ({ ...prev, alignment: aligned }));
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">카메라 오류</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 max-w-4xl mx-auto">
      {/* 안내 메시지 */}
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold mb-2">EFT AR 세션 준비</h2>
        <p className="text-gray-600">{message}</p>
      </div>

      {/* 비디오 화면 */}
      <div className="relative rounded-xl overflow-hidden shadow-lg bg-black mb-6">
        <video
          ref={videoRef}
          className="w-full h-auto block"
          muted
          playsInline
          style={{ transform: 'scaleX(-1)', maxWidth: '640px' }}
        />
        
        <FramingOverlay
          videoRef={videoRef}
          isAligned={status.alignment}
          onAlignmentChange={handleAlignmentChange}
        />

        {/* 카운트다운 오버레이 */}
        {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-white text-8xl font-bold animate-pulse">
              {countdown}
            </div>
          </div>
        )}
      </div>

      {/* 상태 체크리스트 */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-md">
        <StatusCard
          icon="📏"
          title="거리"
          status={status.distance}
          description="60-100cm"
        />
        <StatusCard
          icon="🎯"
          title="정렬"
          status={status.alignment}
          description="상반신 중앙"
        />
        <StatusCard
          icon="💡"
          title="조명"
          status={status.lighting}
          description="밝기 충분"
        />
      </div>

      {/* 안내 텍스트 */}
      <div className="mt-6 text-center text-sm text-gray-500 max-w-md">
        <p>• 카메라를 눈높이에 맞춰 고정해주세요</p>
        <p>• 배경은 단순할수록 좋습니다</p>
        <p>• 모든 조건이 만족되면 자동으로 세션이 시작됩니다</p>
      </div>
    </div>
  );
}

interface StatusCardProps {
  icon: string;
  title: string;
  status: boolean;
  description: string;
}

function StatusCard({ icon, title, status, description }: StatusCardProps) {
  return (
    <div className={`p-3 rounded-lg border-2 transition-all ${
      status 
        ? 'bg-green-50 border-green-300' 
        : 'bg-gray-50 border-gray-300'
    }`}>
      <div className="text-center">
        <div className="text-2xl mb-1">{icon}</div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-gray-500">{description}</div>
        <div className="mt-1">
          {status ? (
            <span className="text-green-600 font-bold">✓</span>
          ) : (
            <span className="text-gray-400">○</span>
          )}
        </div>
      </div>
    </div>
  );
}