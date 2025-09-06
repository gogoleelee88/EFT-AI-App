import { useCallback, useRef, useState, useEffect } from 'react';

export interface CameraConfig {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  deviceId?: string;
}

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef<boolean>(false);   // 🔒 중복 start 방지
  const rafRef = useRef<number | null>(null);   // 🔒 RAF cleanup 가드
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const stopTracks = (stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach(track => {
        console.log(`🛑 Stopping track: ${track.kind}`);
        track.stop();
      });
    }
  };

  const tryOpen = async (constraints: MediaStreamConstraints) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  };

  // 🎯 폴백 레벨별 제약 조건 (관대한 순서)
  const getFallbackConstraints = (config: CameraConfig, level: number): MediaStreamConstraints => {
    const fallbacks = [
      // Level 0: 요청된 제약 조건 그대로
      {
        video: {
          deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
          facingMode: config.facingMode ?? 'user',
          width: { ideal: config.width ?? 640 },
          height: { ideal: config.height ?? 480 }
        },
        audio: false
      },
      // Level 1: facingMode만 유지
      {
        video: {
          facingMode: config.facingMode ?? 'user',
          width: { ideal: Math.min(config.width ?? 640, 480) },
          height: { ideal: Math.min(config.height ?? 480, 320) }
        },
        audio: false
      },
      // Level 2: 최소 해상도
      {
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 }
        },
        audio: false
      },
      // Level 3: 완전 기본 (가장 관대)
      {
        video: true,
        audio: false
      }
    ];
    
    return fallbacks[Math.min(level, fallbacks.length - 1)];
  };

  // 현재 스트림 정리 함수
  const stopCurrentStream = useCallback(() => {
    if (streamRef.current) {
      console.log('🧹 Cleaning up current camera stream');
      stopTracks(streamRef.current);
      streamRef.current = null;
      setIsActive(false);
    }
  }, []);

  const startCamera = useCallback(async (
    videoElement: HTMLVideoElement,
    config: CameraConfig = { width: 640, height: 480, facingMode: 'user' }
  ) => {
    if (!videoElement || startingRef.current) return streamRef.current;
    startingRef.current = true;
    setError(null);

    try {
      // 이전 스트림 정리
      stopCurrentStream();

      // 🔄 폴백 레벨별 시도 (4단계)
      for (let level = 0; level < 4; level++) {
        try {
          const constraints = getFallbackConstraints(config, level);
          console.log(`🎥 Trying camera level ${level}:`, constraints);
          const stream = await tryOpen(constraints);
          streamRef.current = stream;
          console.log(`✅ Camera started at level ${level}`);
          break;
        } catch (e: any) {
          console.warn(`❌ Level ${level} failed:`, e.name, e.message);
          if (level === 3) throw e; // 마지막 레벨에서도 실패하면 에러 던지기
        }
      }

      // 비디오 설정
      videoElement.muted = true;
      // @ts-expect-error safari
      videoElement.playsInline = true;
      videoElement.srcObject = streamRef.current!;

      // 메타데이터 로드 후 play() 호출
      await new Promise<void>(res => {
        if (videoElement.readyState >= 1) return res();
        const onLoaded = () => { videoElement.removeEventListener('loadedmetadata', onLoaded); res(); };
        videoElement.addEventListener('loadedmetadata', onLoaded);
      });

      // 재생 시도
      try { 
        await videoElement.play(); 
      } catch { 
        await new Promise(r => setTimeout(r, 50)); 
        await videoElement.play(); 
      }

      setIsActive(true);
      return streamRef.current!;
    } catch (e: any) {
      const name = e?.name || 'UnknownError';
      setRetryCount(prev => prev + 1);
      
      // 🔍 상세한 에러 분기 및 해결 가이드
      const getErrorDetails = (errorName: string, retries: number) => {
        const baseErrors: Record<string, { message: string; solutions: string[]; canRetry: boolean }> = {
          NotFoundError: {
            message: '카메라 장치를 찾을 수 없습니다',
            solutions: [
              '카메라가 컴퓨터에 연결되어 있는지 확인',
              '다른 브라우저(Chrome/Edge)에서 테스트',
              '외장 웹캠이 있다면 연결 상태 확인',
              '디바이스 관리자에서 카메라 드라이버 확인'
            ],
            canRetry: retries < 2
          },
          NotAllowedError: {
            message: '카메라 권한이 거부되었습니다',
            solutions: [
              '주소창 🔒 클릭 → 카메라 권한을 "허용"으로 변경',
              '브라우저 설정에서 사이트 권한 확인',
              '시크릿 모드가 아닌 일반 모드에서 테스트',
              '페이지 새로고침 후 권한 재요청'
            ],
            canRetry: true
          },
          NotReadableError: {
            message: '다른 애플리케이션이 카메라를 사용 중입니다',
            solutions: [
              'Zoom, Teams, Skype 등 화상회의 앱 종료',
              '카메라 앱, 윈도우 카메라 앱 종료',
              'OBS, XSplit 등 방송 프로그램 종료',
              '시스템 재시작 후 재시도'
            ],
            canRetry: true
          },
          OverconstrainedError: {
            message: '요청한 카메라 설정을 지원하지 않습니다',
            solutions: [
              `해상도를 낮춰서 재시도 (현재 시도: ${retries + 1}/4단계)`,
              '다른 카메라 장치 선택',
              '카메라 드라이버 업데이트'
            ],
            canRetry: true
          },
          SecurityError: {
            message: '보안 제약으로 인해 카메라에 접근할 수 없습니다',
            solutions: [
              'HTTPS 사이트에서 접속 (현재: ' + window.location.protocol + ')',
              'localhost 또는 127.0.0.1에서 테스트',
              'HTTP에서는 카메라 접근이 차단됩니다'
            ],
            canRetry: false
          },
          AbortError: {
            message: '카메라 접근이 중단되었습니다',
            solutions: [
              '페이지 새로고침 후 재시도',
              '다른 탭에서 카메라 사용 중인지 확인',
              '브라우저 재시작'
            ],
            canRetry: true
          }
        };
        
        return baseErrors[errorName] || {
          message: `알 수 없는 카메라 오류 (${errorName})`,
          solutions: [
            '페이지 새로고침 후 재시도',
            '다른 브라우저에서 테스트',
            '시스템 재시작'
          ],
          canRetry: true
        };
      };
      
      const errorDetails = getErrorDetails(name, retryCount);
      const detailedMessage = `${errorDetails.message}\n\n해결 방법:\n${errorDetails.solutions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      
      console.error('🚨 Camera error details:', {
        name,
        message: e?.message,
        retryCount,
        solutions: errorDetails.solutions
      });
      
      setError(detailedMessage);
      stopTracks(streamRef.current);
      streamRef.current = null;
      setIsActive(false);
      throw e;
    } finally {
      startingRef.current = false;
    }
  }, [stopCurrentStream]);

  const stopCamera = useCallback(() => {
    // RAF cleanup
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    stopCurrentStream();
  }, [stopCurrentStream]);

  // 🔄 페이지 가시성 API - 백그라운드에서 카메라 정지
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isActive) {
        console.log('📱 Page hidden, pausing camera stream');
        // 스트림은 유지하되 처리만 중단
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (!document.hidden && isActive && streamRef.current) {
        console.log('📱 Page visible, resuming camera stream');
        // 카메라 처리 재개는 상위 컴포넌트에서 관리
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive]);

  // 🧹 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      stopTracks(streamRef.current);
    };
  }, []);

  return { 
    startCamera, 
    stopCamera,
    stopCurrentStream,
    isActive, 
    error, 
    stream: streamRef.current,
    retryCount 
  };
}