const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

const trimOrEmpty = (value: string | undefined | null): string => (value || '').trim();

const toApiUrl = (raw: string): string => {
  const candidate = trimOrEmpty(raw);
  if (!candidate || candidate === '/') {
    return '';
  }

  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
  try {
    const parsed = new URL(withScheme);
    const host = trimOrEmpty(parsed.hostname);
    if (!host) return '';
    return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const toWsOrigin = (base: string): string => {
  if (!base) return '';
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`;
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`;
  return '';
};

const hasExplicitApiBase = Boolean(trimOrEmpty(import.meta.env.VITE_API_BASE_URL));
const envApiBase = toApiUrl(import.meta.env.VITE_API_BASE_URL || '');
const fallbackApiBase = (() => {
  if (!isDevelopment || typeof window === 'undefined') {
    return '';
  }
  const host = trimOrEmpty(window.location.hostname);
  if (!host) {
    return '';
  }
  return `http://${host}:8000`;
})();
const envProdOrigin = toApiUrl(import.meta.env.VITE_PRODUCTION_ORIGIN || '');
const API_BASE_URL = isProduction
  ? envApiBase || envProdOrigin
  : (hasExplicitApiBase || fallbackApiBase) ? (envApiBase || fallbackApiBase) : '';

export const hasValidApiBase = Boolean(API_BASE_URL);

const resolvedApiBase = API_BASE_URL || '';

export const API_CONFIG = {
  API_BASE_URL: resolvedApiBase,
  VLLM_ENGINE_A_URL: '/v1',
  VLLM_ENGINE_B_URL: '/v1',
  WS_URL: resolvedApiBase ? `${toWsOrigin(resolvedApiBase)}/api/ws` : '/api/ws',
};

export const ENDPOINTS = {
  CHAT_COMPARE: '/api/chat/compare',
  CHAT_COMPLETION: '/api/chat/completion',
  RECOMMEND_EFT: '/api/recommend/eft',
  HEALTH: '/api/health',
  VERSION: '/api/version',
  STATS: '/api/stats',
  PROFILE: '/api/profile',
  PROFILE_DAILY: '/api/profile/daily',
  VLLM_ENGINE_A: '/v1/chat/completions',
  VLLM_ENGINE_B: '/v1/chat/completions',
};

if (isDevelopment) {
  console.log('🔧 API Config:', API_CONFIG);
  console.log('🔧 API Endpoints:', ENDPOINTS);
}

export const ENV_INFO = {
  isDevelopment,
  isProduction,
  mode: import.meta.env.MODE,
  baseUrl: import.meta.env.BASE_URL,
} as const;

export type ApiConfig = typeof API_CONFIG;
export type EndpointsType = typeof ENDPOINTS;
