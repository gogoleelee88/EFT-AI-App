/**
 * API 엔드포인트 환경별 설정
 * 개발 환경: localhost 직접 연결
 * 프로덕션 환경: Nginx 프록시 경로 사용
 */

// 환경 감지
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// 🌐 프로덕션 도메인 (window.location 기준으로 자동 감지)
const resolveProductionDomain = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  const envOrigin = (import.meta.env.VITE_PRODUCTION_ORIGIN as string | undefined)?.trim();
  if (envOrigin) {
    return envOrigin.replace(/\/+$/, '');
  }

  // 기본값은 공개 서비스 도메인의 www 서브도메인을 사용
  return 'https://www.moodtalk.app';
};

const PRODUCTION_DOMAIN = resolveProductionDomain();

const toWebsocketUrl = (origin: string) => {
  if (!origin) return 'wss://www.moodtalk.app';
  try {
    const url = new URL(origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol;
    return url.toString().replace(/\/+$/, '') + '/api/ws';
  } catch {
    return origin.replace(/^http/, 'ws');
  }
};

// ✅ 단일 설정으로 통일 (상대경로만 사용)
// Vite proxy (개발) 또는 Cloudflare Workers/Nginx (운영)가 라우팅 처리
export const API_CONFIG = {
  // FastAPI 백엔드 (상대경로만 사용)
  API_BASE_URL: '',

  // vLLM 엔진들 (프록시가 /v1/* 를 8001/8002로 라우팅)
  VLLM_ENGINE_A_URL: '/v1',
  VLLM_ENGINE_B_URL: '/v1',

  // WebSocket (상대경로)
  WS_URL: '/api/ws',
};

// 📝 개별 엔드포인트들 (모두 상대경로)
export const ENDPOINTS = {
  // 🤖 AI 채팅 관련
  CHAT: '/api/chat',
  CHAT_COMPARE: '/api/chat/compare',
  CHAT_COMPLETION: '/api/chat/completion',

  // 📊 분석 관련
  ANALYZE_EMOTION: '/api/analyze/emotion',
  RECOMMEND_EFT: '/api/recommend/eft',

  // 📈 통계 및 모니터링
  HEALTH: '/api/health',
  STATS: '/api/stats',

  // 🎯 vLLM 직접 연결 (프록시가 처리)
  VLLM_ENGINE_A: '/v1/chat/completions',
  VLLM_ENGINE_B: '/v1/chat/completions',
};

// 🔍 디버깅 정보
if (isDevelopment) {
  console.log('🔧 Development API Config:', API_CONFIG);
  console.log('📡 API Endpoints:', ENDPOINTS);
}

// 🛡️ 타입 안전성
export type ApiConfig = typeof API_CONFIG;
export type EndpointsType = typeof ENDPOINTS;

// 🌐 환경 정보 노출
export const ENV_INFO = {
  isDevelopment,
  isProduction,
  mode: import.meta.env.MODE,
  baseUrl: import.meta.env.BASE_URL,
} as const;