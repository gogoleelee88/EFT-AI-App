import { API_CONFIG } from '@/config/api';

const shouldProxyToBackend = (path: string): boolean => {
  return (
    path.startsWith('/api') ||
    path.startsWith('/v1') ||
    path.startsWith('/suds') ||
    path === '/health' ||
    path === '/version' ||
    path.startsWith('/health/') ||
    path.startsWith('/version/') ||
    path.startsWith('/ws/')
  );
};

export function isBackendApiPath(path: string): boolean {
  return shouldProxyToBackend(path);
}

export function resolveBackendUrl(path: string, apiBase: string = API_CONFIG.API_BASE_URL): string {
  if (!apiBase || !path.startsWith('/')) {
    return path;
  }
  if (!apiBase.startsWith('http://') && !apiBase.startsWith('https://')) {
    return path;
  }
  if (!shouldProxyToBackend(path)) {
    return path;
  }
  const base = apiBase.replace(/\/+$/, '');
  if (!base) {
    return path;
  }
  return `${base}${path}`;
}

export function createApiHeaders(apiKey?: string): Headers {
  const h = new Headers();
  h.set('Content-Type', 'application/json; charset=utf-8');

  const key = apiKey ?? localStorage.getItem('PREMIUM_API_KEY') ?? (import.meta as any).env?.VITE_API_KEY ?? undefined;
  if (key) h.set('X-API-Key', key);

  return h;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const requestPath = resolveBackendUrl(path);
  const res = await fetch(requestPath, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}
