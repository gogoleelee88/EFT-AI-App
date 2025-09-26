import { useState, useRef, useEffect, useCallback } from 'react';
import { useCamera } from '../useCamera';
import { useNavigate } from 'react-router-dom';
import FramingOverlay from './FramingOverlay';

interface CalibrationProps {
  onReady: () => void;
  message?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

interface CalibrationStatus {
  distance: boolean;    // 거리 적절
  alignment: boolean;   // 정렬 상태
  lighting: boolean;    // 조명 상태
}

export default function Calibration({ 
  onReady, 
  message = "초록 박스에 상반신을 맞춰주세요",
  showBackButton = true,
  onBack
}: CalibrationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null); // 스트림 레퍼런스
  const didInitRef = useRef(false); // 🔒 중복 초기화 가드
  
  const [status, setStatus] = useState<CalibrationStatus>({
    distance: false,
    alignment: false,
    lighting: false
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<{
    isIOS: boolean;
    isSafari: boolean;
    isSecureContext: boolean;
    protocol: string;
  } | null>(null);

  // 단 한 번만 호출되도록 가드
  const readyCalledRef = useRef(false);
  const safeReady = useCallback(() => {
    if (readyCalledRef.current) return;
    readyCalledRef.current = true;
    console.log('✅ Calibration ready triggered');
    onReady();
  }, [onReady]);

  const camera = useCamera();
  const navigate = useNavigate();

  // 🔍 디바이스 및 환경 감지
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isSecureContext = window.isSecureContext;
    const protocol = window.location.protocol;
    
    setDeviceInfo({
      isIOS,
      isSafari,
      isSecureContext,
      protocol
    });

    // iOS/Safari 특이점 로깅
    if (isIOS) {
      console.log('📱 iOS device detected');
    }
    if (isSafari) {
      console.log('🧭 Safari browser detected');
    }
    if (!isSecureContext) {
      console.warn('🔒 Non-secure context detected, camera may not work');
    }
  }, []);

  // 🎥 Video DOM 보장 - hostRef로 동적 생성
  const hostRef = useRef<HTMLDivElement>(null);
  
  const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

  // ✅ 항상 host 컨테이너를 확보 (없으면 동적 생성)
  const ensureHostContainer = useCallback(async (): Promise<HTMLDivElement> => {
    if (hostRef.current && document.contains(hostRef.current)) {
      return hostRef.current;
    }

    let host = document.getElementById('calibHost') as HTMLDivElement | null;
    if (host && document.contains(host)) {
      hostRef.current = host;
      return host;
    }

    // 안정적인 부모(#root가 없으면 body)에 동적 생성
    const parent = (document.querySelector('#root') as HTMLElement) || document.body;
    host = document.createElement('div');
    host.id = 'calibHost';
    host.className = 'relative rounded-xl overflow-hidden shadow-lg bg-black mb-6';
    host.style.width = '100%';
    parent.appendChild(host);
    await nextFrame();
    hostRef.current = host;
    console.log('📦 Created host container dynamically');
    return host;
  }, []);

  // ✅ 어떤 경우에도 <video>를 확보 (없으면 생성해서 host에 꽂음)
  const ensureVideoElement = useCallback(async (): Promise<HTMLVideoElement> => {
    if (videoRef.current && document.contains(videoRef.current)) {
      return videoRef.current;
    }

    let video = document.getElementById('calibVideo') as HTMLVideoElement | null;
    if (!video || !document.contains(video)) {
      const host = await ensureHostContainer();
      video = document.createElement('video');
      video.id = 'calibVideo';
      video.className = 'w-full h-auto block bg-black';
      video.muted = true;
      video.setAttribute('playsInline', '');
      video.setAttribute('autoplay', '');
      video.style.cssText = 'transform: scaleX(-1); max-width: 640px; width: 100%; background: #000; visibility: visible; display: block;';
      
      // 기존 video 제거 후 새로 추가
      host.querySelectorAll('video').forEach(v => v.remove());
      host.appendChild(video);
      await nextFrame();
      console.log('📹 Created video element dynamically');
    }
    videoRef.current = video;
    return video;
  }, [ensureHostContainer]);

  // 🎥 콜백 ref: DOM 붙는 순간에 카메라 초기화 (User Gesture에서 호출)
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (!node) {
      console.log('📹 Calibration video element unmounted');
      return;
    }

    videoRef.current = node;
    console.log('📹 Calibration video element mounted, waiting for user gesture...');
  }, []);

  // 스트림 정리 헬퍼
  const stopCurrentStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };


  const microtask = () => Promise.resolve();

  // 🖱️ 사용자 제스처로 카메라 시작 (iOS 대응) - 폼 submit/라우팅 방지
  const handleStartCamera = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault(); // 폼 submit/라우팅 방지
    if (starting || started || didInitRef.current) {
      console.log('🔒 Camera already starting/initialized in Calibration');
      return;
    }

    setStarting(true);
    setError(null);
    console.log('🚀 Starting camera initialization...');
    
    try {
      // microtask + nextFrame: DOM에 ref가 꽂힐 시간 확보
      await microtask();
      await nextFrame();

      // Video element 보장 - ensureVideoElement로 확보
      const video = await ensureVideoElement();

      console.log('VIDEO ref?', !!videoRef.current);
      console.log('VIDEO qs?', !!document.getElementById('calibVideo'));
      console.log('HOST container?', !!document.getElementById('calibHost'));

      if (deviceInfo?.isIOS || deviceInfo?.isSafari) {
        console.log('📱 iOS/Safari: Starting camera with user gesture');
      }

      // 기존 스트림 정리
      stopCurrentStream();

      didInitRef.current = true;
      console.log('🎥 Starting camera with user gesture in Calibration...');
      
      // 자동재생 요건 재확인
      video.muted = true;
      (video as any).playsInline = true;
      video.setAttribute('autoplay', '');
      
      // 카메라 시작
      await camera.startCamera(video, { 
        width: 1280, 
        height: 720, 
        facingMode: 'user' 
      });

      // 일부 브라우저 호환
      await video.play().catch(() => {
        console.log('🔄 Play failed, but continuing...');
      });
      
      setIsReady(true);
      setStarted(true);
      console.log('✅ Calibration camera started successfully');
      
      // 개발 모드에서만 자동 완료 (프로덕션 빌드에서 절대 동작 금지)
      const devAutoCalib = import.meta.env.DEV && import.meta.env.MODE === 'development';
      if (devAutoCalib) {
        setTimeout(() => {
          console.log('🚀 Dev auto-calibration (guarded) triggered');
          safeReady();
        }, 2000);
      }
      
    } catch (err: any) {
      console.error('🚨 Calibration camera failed:', err);
      didInitRef.current = false; // 실패하면 다시 시도 허용
      
      
      setError(err?.message ?? '카메라 시작 실패');
    } finally {
      setStarting(false);
    }
  };

  // 상태 체크 시뮬레이션
  useEffect(() => {
    if (!isReady) return;

    const checkStatus = () => {
      // 실제로는 MediaPipe로 포즈를 분석하여 판단
      // 여기서는 시간 기반 시뮬레이션
      const now = Date.now();
      const cycle = now % 8000; // 8초 사이클

      const newStatus = {
        distance: cycle > 1000,   // 1초 후 거리 OK
        alignment: cycle > 3000,  // 3초 후 정렬 OK
        lighting: cycle > 2000    // 2초 후 조명 OK
      };
      
      // 디버그: 조건 변경 시에만 로그
      setStatus(prevStatus => {
        const changed = prevStatus.distance !== newStatus.distance || 
                       prevStatus.alignment !== newStatus.alignment || 
                       prevStatus.lighting !== newStatus.lighting;
        if (changed) {
          console.log('📊 Calibration status:', {
            distance: newStatus.distance,
            alignment: newStatus.alignment, 
            lighting: newStatus.lighting,
            cycle: Math.round(cycle)
          });
        }
        return newStatus;
      });
    };

    const interval = setInterval(checkStatus, 100);
    return () => clearInterval(interval);
  }, [isReady]);

  // 모든 상태가 OK일 때 카운트다운 시작
  useEffect(() => {
    const allReady = status.distance && status.alignment && status.lighting;
    
    if (allReady && countdown === null) {
      console.log('🎯 All calibration conditions met! Starting countdown...');
      setCountdown(3);
      
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timer);
            setTimeout(safeReady, 100); // 약간의 딜레이 후 세션 시작
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

  // 🧹 언마운트 시 정리
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up Calibration component...');
      stopCurrentStream();
      didInitRef.current = false;
    };
  }, []);

  const handleAlignmentChange = (aligned: boolean) => {
    setStatus(prev => ({ ...prev, alignment: aligned }));
  };

  const handleRetry = async () => {
    setError(null);
    setIsReady(false);
    setStarted(false);
    didInitRef.current = false; // 재시도 허용
    stopCurrentStream(); // 기존 스트림 정리
    
    // 재시도 시 약간의 지연 (iOS 안정성)
    setTimeout(() => {
      handleStartCamera();
    }, deviceInfo?.isIOS ? 500 : 100);
  };

  const handleBackToEFT = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/'); // 메인 대시보드로 돌아가기
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="text-center max-w-lg">
          <div className="text-red-500 text-6xl mb-4">📷</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">카메라 접근 문제</h3>
          <p className="text-red-600 mb-6">{error}</p>
          
          {/* 🔍 환경별 맞춤 해결 방법 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <h4 className="font-semibold text-blue-800 mb-3">💡 해결 방법 ({camera.retryCount}/4 폴백 시도됨):</h4>
            
            {/* 기본 해결 방법 */}
            <div className="text-sm text-blue-700 space-y-2 mb-4">
              <div className="grid grid-cols-1 gap-2">
                {error.split('\n').slice(2).map((solution, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-blue-600 font-mono text-xs mt-0.5">•</span>
                    <span>{solution}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 환경별 추가 안내 */}
            {deviceInfo && (
              <div className="border-t border-blue-200 pt-3 mt-3">
                <h5 className="font-medium text-blue-800 mb-2">🔧 현재 환경 분석:</h5>
                <div className="text-xs text-blue-600 space-y-1">
                  <div>• 프로토콜: {deviceInfo.protocol} {!deviceInfo.isSecureContext && <span className="text-red-600">(⚠️ 보안 컨텍스트 아님)</span>}</div>
                  <div>• 브라우저: {deviceInfo.isSafari ? 'Safari' : 'Other'} {deviceInfo.isIOS && <span>(iOS)</span>}</div>
                  {deviceInfo.isIOS && (
                    <div className="bg-yellow-100 border border-yellow-300 rounded p-2 mt-2">
                      <div className="text-yellow-800 text-xs">
                        <strong>📱 iOS 사용자 안내:</strong>
                        <br />• iOS 15+ 권장 (구버전에서 제한적)
                        <br />• Safari에서 "사이트별 설정" → 카메라 허용
                        <br />• 저전력 모드 해제 권장
                      </div>
                    </div>
                  )}
                  {!deviceInfo.isSecureContext && (
                    <div className="bg-red-100 border border-red-300 rounded p-2 mt-2">
                      <div className="text-red-800 text-xs">
                        <strong>🔒 보안 경고:</strong> HTTPS 또는 localhost가 아닌 환경에서는 카메라 접근이 제한됩니다.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
            >
              🔄 다시 시도 ({4 - (camera.retryCount || 0)}단계 폴백 남음)
            </button>
            <button
              onClick={handleBackToEFT}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
            >
              🏠 EFT 가이드로 돌아가기
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              🔃 페이지 새로고침
            </button>
          </div>

          {/* 디버깅 도움말 */}
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              🔧 고급 사용자용: 브라우저 콘솔에서 직접 확인
            </summary>
            <div className="mt-3 p-3 bg-gray-100 rounded text-xs font-mono text-left">
              <p className="mb-2 text-gray-600">콘솔(F12)에 아래 코드를 붙여넣어 카메라 상태를 확인하세요:</p>
              <code className="block bg-white p-2 rounded border">
{`// A. 카메라 장치 나열
navigator.mediaDevices.enumerateDevices().then(list => {
  const cams = list.filter(d => d.kind === 'videoinput');
  console.table(cams.map(({deviceId,label,groupId})=>({deviceId,label,groupId})));
});

// B. 기본 카메라 테스트
navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(()=>console.log('✅ camera OK'))
  .catch(e=>console.error('❌ error:', e.name, e.message));`}
              </code>
            </div>
          </details>
        </div>
      </div>
    );
  }

  // 🚀 초기 카메라 시작 화면 (iOS User Gesture 대응)
  if (!isReady && !error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] p-6">
        <div className="text-center max-w-md">
          <div className="text-blue-500 text-6xl mb-4">📷</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">AR EFT 세션 준비</h3>
          <p className="text-gray-600 mb-6">{message}</p>
          
          {/* 환경별 안내 메시지 */}
          {deviceInfo && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-left">
              <h4 className="font-semibold text-gray-800 mb-3">📋 시작 전 확인사항:</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• 조용한 환경에서 진행하세요</li>
                <li>• 충분한 조명을 확보하세요</li>
                <li>• 카메라가 얼굴을 정면으로 볼 수 있도록 하세요</li>
                {deviceInfo.isIOS && (
                  <>
                    <li>• 📱 iOS: 저전력 모드를 해제해주세요</li>
                    <li>• 🔋 배터리가 충분한지 확인하세요</li>
                  </>
                )}
                {!deviceInfo.isSecureContext && (
                  <li>• ⚠️ HTTPS 환경에서 사용을 권장합니다</li>
                )}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleStartCamera}
              disabled={starting || started}
              className={`w-full px-8 py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 ${
                starting || started 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {starting ? '📷 카메라 시작 중...' : started ? '✅ 카메라 실행 중' : '🚀 카메라 시작하기'}
            </button>
            
            {showBackButton && (
              <button
                onClick={handleBackToEFT}
                className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ← 뒤로 돌아가기
              </button>
            )}
          </div>

          {/* iOS Safari 추가 안내 */}
          {deviceInfo?.isIOS && deviceInfo?.isSafari && (
            <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-sm text-yellow-800">
                <strong>📱 Safari 사용자:</strong> 카메라 권한을 요청하면 반드시 "허용"을 선택해주세요.
              </div>
            </div>
          )}
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

      {/* ✅ 항상 존재하는 host 컨테이너 */}
      <div 
        id="calibHost"
        ref={hostRef}
        className="relative rounded-xl overflow-hidden shadow-lg bg-black mb-6"
        style={{ width: '100%' }}
      >
        {/* 있을 때는 이 video를 사용(없어도 ensureVideoElement가 생성) */}
        <video
          id="calibVideo"
          ref={setVideoRef}
          className="w-full h-auto block bg-black"
          muted
          autoPlay
          playsInline
          style={{ 
            transform: 'scaleX(-1)', 
            maxWidth: '640px', 
            width: '100%', 
            background: '#000', 
            visibility: 'visible', 
            display: 'block' 
          }}
        />
        
        <FramingOverlay
          videoRef={videoRef as React.RefObject<HTMLVideoElement>}
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
        <p>• 카메라를 눈높이에 맞춰주세요</p>
        <p>• 밝은 조명 아래에서 진행하세요</p>
        <p>• 모든 조건이 완료되면 세션이 시작됩니다</p>
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