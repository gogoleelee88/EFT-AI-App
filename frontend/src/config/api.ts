/**
 * API 엔드포인트 환경별 설정
 * 개발 환경: localhost 직접 연결
 * 프로덕션 환경: Nginx 프록시 경로 사용
 */

// 환경 감지
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// 🌐 프로덕션 도메인 (moodtalk.app)
const PRODUCTION_DOMAIN = 'https://moodtalk.app';

// 🔧 개발 환경 설정
const DEVELOPMENT_CONFIG = {
  // FastAPI 백엔드
  API_BASE_URL: 'http://localhost:8000',

  // vLLM 엔진들 (직접 연결)
  VLLM_ENGINE_A_URL: 'http://localhost:8001',
  VLLM_ENGINE_B_URL: 'http://localhost:8002',

  // WebSocket (Socket.IO)
  WS_URL: 'ws://localhost:8000',
};

// 🚀 프로덕션 환경 설정 (Nginx 프록시 사용)
const PRODUCTION_CONFIG = {
  // FastAPI 백엔드 (Nginx: /api/ → http://127.0.0.1:8000/)
  API_BASE_URL: `${PRODUCTION_DOMAIN}/api`,

  // vLLM 엔진들 (Nginx 프록시 사용)
  // location /vllm-a/ { proxy_pass http://127.0.0.1:8001/; }
  VLLM_ENGINE_A_URL: `${PRODUCTION_DOMAIN}/vllm-a`,

  // location /vllm-b/ { proxy_pass http://127.0.0.1:8002/; }
  VLLM_ENGINE_B_URL: `${PRODUCTION_DOMAIN}/vllm-b`,

  // WebSocket (Nginx WebSocket 프록시)
  WS_URL: `wss://moodtalk.app/api/ws`,
};

// 🎯 현재 환경에 따른 설정 선택
export const API_CONFIG = isDevelopment ? DEVELOPMENT_CONFIG : PRODUCTION_CONFIG;

// 📝 개별 엔드포인트들
export const ENDPOINTS = {
  // 🤖 AI 채팅 관련
  CHAT: `${API_CONFIG.API_BASE_URL}/chat`,
  CHAT_COMPARE: `${API_CONFIG.API_BASE_URL}/chat/compare`,
  CHAT_COMPLETION: `${API_CONFIG.API_BASE_URL}/chat/completion`,

  // 📊 분석 관련
  ANALYZE_EMOTION: `${API_CONFIG.API_BASE_URL}/analyze/emotion`,
  RECOMMEND_EFT: `${API_CONFIG.API_BASE_URL}/recommend/eft`,

  // 📈 통계 및 모니터링
  HEALTH: `${API_CONFIG.API_BASE_URL}/health`,
  STATS: `${API_CONFIG.API_BASE_URL}/stats`,

  // 🎯 vLLM 직접 연결 (프로덕션에서는 프록시 경로)
  VLLM_ENGINE_A: `${API_CONFIG.VLLM_ENGINE_A_URL}/v1/chat/completions`,
  VLLM_ENGINE_B: `${API_CONFIG.VLLM_ENGINE_B_URL}/v1/chat/completions`,
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