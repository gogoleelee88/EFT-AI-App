// frontend/src/services/http.ts
const env = (import.meta as any).env ?? {};
const BASE: string =
  env.VITE_API_BASE_URL ||
  env.VITE_BACKEND_URL ||
  'http://localhost:8000'; // dev fallback

const API_KEY: string | undefined = env.VITE_API_KEY;

export function createApiHeaders(apiKey?: string): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json; charset=utf-8');

  // 우선순위: 인자로 받은 apiKey > localStorage > 환경변수 > 없음
  const key = apiKey ?? localStorage.getItem('PREMIUM_API_KEY') ?? API_KEY ?? undefined;
  if (key) h.set('X-API-Key', key);

  return h;
}

export const http = (path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, init);

export const httpJson = (path: string, body: any, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
    ...init,
  });

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}