import { isApiPath, resolveBackendUrl as resolveBackendUrlFromConfig } from '@/config/api';

const toAbsoluteUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (!isApiPath(url)) {
    return url;
  }
  return resolveBackendUrlFromConfig(url);
};

export function isBackendApiPath(path: string): boolean {
  return isApiPath(path);
}

export function resolveBackendUrl(path: string): string {
  return toAbsoluteUrl(path);
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
  const res = await fetch(requestPath, {
    ...init,
    credentials: init.credentials ?? 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}
