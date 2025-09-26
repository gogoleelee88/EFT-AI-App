// frontend/src/services/http.ts
export function createApiHeaders(apiKey?: string): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json; charset=utf-8');

  // 우선순위: 인자로 받은 apiKey > localStorage > 환경변수 > 없음
  const key = apiKey ?? localStorage.getItem('PREMIUM_API_KEY') ?? (import.meta as any).env?.VITE_API_KEY ?? undefined;
  if (key) h.set('X-API-Key', key);

  return h;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const base = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:8000';
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}