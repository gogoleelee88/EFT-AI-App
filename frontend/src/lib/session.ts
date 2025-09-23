// frontend/src/lib/session.ts
// 세션 ID 관리 - 앱 재방문 시에도 동일한 세션 유지

const KEY = 'eft.sess.id';

export function getOrCreateSessionId(fallback?: string): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;

    const id =
      (globalThis as any)?.crypto?.randomUUID?.() ??
      Math.random().toString(36).slice(2) + Date.now().toString(36);

    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return (
      fallback ??
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }
}

export function resetSessionId(): string {
  const id =
    (globalThis as any)?.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);

  try {
    localStorage.setItem(KEY, id);
  } catch {}

  return id;
}