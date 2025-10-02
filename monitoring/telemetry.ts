/**
 * 프론트엔드 텔레메트리 핑 시스템
 *
 * 목적: 앱 부팅 시 자동으로 백엔드 헬스체크 + 사용자 활동 추적
 * 실행: bootSmoke() 함수를 App.tsx의 useEffect에서 호출
 */

import axios from 'axios';

// ===================================================================
// 설정
// ===================================================================

const API_BASE = import.meta.env.VITE_API_BASE || 'https://moodtalk.app/api';
const TELEMETRY_ENABLED = import.meta.env.VITE_TELEMETRY_ENABLED !== 'false';
const PING_TIMEOUT = 5000; // 5초 타임아웃
const RETRY_COUNT = 2;

// ===================================================================
// 타입 정의
// ===================================================================

interface TelemetryData {
  event: 'boot' | 'active' | 'session_start' | 'session_end';
  timestamp: number;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  pwaInstalled: boolean;
  serviceWorkerActive: boolean;
}

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'failed';
  apiReachable: boolean;
  responseTime: number;
  serverVersion?: string;
  tier?: string;
}

interface BootSmokeResult {
  success: boolean;
  health: HealthCheckResult;
  telemetrySent: boolean;
  errors: string[];
}

// ===================================================================
// 유틸리티 함수
// ===================================================================

/**
 * 환경 정보 수집
 */
function collectEnvironmentInfo(): Omit<TelemetryData, 'event' | 'timestamp'> {
  return {
    userAgent: navigator.userAgent,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    pwaInstalled: window.matchMedia('(display-mode: standalone)').matches,
    serviceWorkerActive: 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
  };
}

/**
 * 백엔드 헬스체크 (재시도 포함)
 */
async function checkBackendHealth(retries = RETRY_COUNT): Promise<HealthCheckResult> {
  const startTime = performance.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(`${API_BASE}/health`, {
        timeout: PING_TIMEOUT,
        validateStatus: (status) => status < 500 // 5xx만 실패로 간주
      });

      const responseTime = performance.now() - startTime;

      if (response.status === 200) {
        return {
          status: 'ok',
          apiReachable: true,
          responseTime,
          serverVersion: response.data.version,
          tier: response.data.tier
        };
      } else {
        return {
          status: 'degraded',
          apiReachable: true,
          responseTime
        };
      }
    } catch (error) {
      if (attempt < retries) {
        // 재시도 전 대기 (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }

      // 최종 실패
      return {
        status: 'failed',
        apiReachable: false,
        responseTime: performance.now() - startTime
      };
    }
  }

  // 이론상 도달 불가능 (TypeScript 만족용)
  return {
    status: 'failed',
    apiReachable: false,
    responseTime: performance.now() - startTime
  };
}

/**
 * 텔레메트리 데이터 전송
 */
async function sendTelemetry(event: TelemetryData['event']): Promise<boolean> {
  if (!TELEMETRY_ENABLED) {
    console.log('[Telemetry] Disabled, skipping ping');
    return false;
  }

  try {
    const telemetryData: TelemetryData = {
      event,
      timestamp: Date.now(),
      ...collectEnvironmentInfo()
    };

    await axios.post(`${API_BASE}/telemetry/ping`, telemetryData, {
      timeout: PING_TIMEOUT,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('[Telemetry] Ping sent:', event);
    return true;
  } catch (error) {
    console.warn('[Telemetry] Failed to send ping:', error);
    return false;
  }
}

// ===================================================================
// 핵심 함수: bootSmoke()
// ===================================================================

/**
 * 앱 부팅 시 실행할 스모크 테스트
 *
 * 사용법:
 * ```typescript
 * useEffect(() => {
 *   bootSmoke().then(result => {
 *     if (!result.success) {
 *       console.error('Backend unreachable', result.errors);
 *       showOfflineUI();
 *     }
 *   });
 * }, []);
 * ```
 */
export async function bootSmoke(): Promise<BootSmokeResult> {
  console.log('[BootSmoke] Starting...');

  const errors: string[] = [];

  // 1. 백엔드 헬스체크
  const health = await checkBackendHealth();

  if (!health.apiReachable) {
    errors.push('Backend API unreachable');
  }

  // 2. 텔레메트리 핑 (boot 이벤트)
  const telemetrySent = await sendTelemetry('boot');

  if (!telemetrySent && TELEMETRY_ENABLED) {
    errors.push('Telemetry ping failed');
  }

  // 3. 최종 결과
  const success = health.status === 'ok';

  console.log('[BootSmoke] Complete:', {
    success,
    health,
    telemetrySent,
    errors
  });

  return {
    success,
    health,
    telemetrySent,
    errors
  };
}

// ===================================================================
// 추가 텔레메트리 함수
// ===================================================================

/**
 * 사용자 활동 핑 (주기적 호출용)
 */
export async function pingActive(): Promise<void> {
  await sendTelemetry('active');
}

/**
 * 세션 시작 핑 (로그인 시)
 */
export async function pingSessionStart(): Promise<void> {
  await sendTelemetry('session_start');
}

/**
 * 세션 종료 핑 (로그아웃/종료 시)
 */
export async function pingSessionEnd(): Promise<void> {
  await sendTelemetry('session_end');
}

/**
 * 주기적 활동 추적 설정
 *
 * 사용법:
 * ```typescript
 * const stopTracking = startPeriodicPing(60000); // 1분마다
 * // 나중에 중단: stopTracking();
 * ```
 */
export function startPeriodicPing(intervalMs = 60000): () => void {
  console.log(`[Telemetry] Starting periodic ping (every ${intervalMs}ms)`);

  const intervalId = setInterval(() => {
    pingActive();
  }, intervalMs);

  // 중단 함수 반환
  return () => {
    console.log('[Telemetry] Stopping periodic ping');
    clearInterval(intervalId);
  };
}

// ===================================================================
// 에러 리포팅 (선택사항)
// ===================================================================

/**
 * 클라이언트 오류 리포팅
 */
export async function reportError(error: Error, context?: Record<string, any>): Promise<void> {
  if (!TELEMETRY_ENABLED) return;

  try {
    await axios.post(`${API_BASE}/telemetry/error`, {
      message: error.message,
      stack: error.stack,
      context: {
        ...collectEnvironmentInfo(),
        ...context
      },
      timestamp: Date.now()
    }, {
      timeout: PING_TIMEOUT
    });

    console.log('[Telemetry] Error reported:', error.message);
  } catch (e) {
    console.warn('[Telemetry] Failed to report error:', e);
  }
}

// ===================================================================
// 백엔드 엔드포인트 예시 (참고용)
// ===================================================================

/*
FastAPI 백엔드에 다음 엔드포인트 추가:

from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

class TelemetryPing(BaseModel):
    event: str
    timestamp: int
    userAgent: str
    screenResolution: str
    timezone: str
    language: str
    pwaInstalled: bool
    serviceWorkerActive: bool

class ErrorReport(BaseModel):
    message: str
    stack: str | None = None
    context: dict
    timestamp: int

@router.post("/ping")
async def telemetry_ping(ping: TelemetryPing):
    # 로그 기록 또는 DB 저장
    print(f"[Telemetry] {ping.event} from {ping.userAgent[:50]}...")

    # 선택사항: Redis/Firestore에 저장
    # await save_telemetry(ping.dict())

    return {"status": "ok", "received_at": datetime.utcnow().isoformat()}

@router.post("/error")
async def telemetry_error(error: ErrorReport):
    # 에러 로그 기록
    print(f"[Error] {error.message}")

    # 선택사항: Sentry/Rollbar로 전송
    # await send_to_sentry(error.dict())

    return {"status": "ok", "error_logged": True}

# main.py에 등록:
app.include_router(router)
*/
