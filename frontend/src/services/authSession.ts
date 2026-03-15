import { resolveBackendUrl } from "@/config/api";

export type BackendAuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  photo_url?: string | null;
};

type BackendMeResponse = {
  authenticated?: boolean;
  user?: BackendAuthUser | null;
};

const AUTH_ME_PATH = "/api/auth/me";
const AUTH_REFRESH_PATH = "/api/auth/refresh";

let refreshPromise: Promise<boolean> | null = null;

const parseJson = async <T,>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const fetchBackendMe = async (): Promise<BackendAuthUser | null> => {
  const response = await fetch(resolveBackendUrl(AUTH_ME_PATH), {
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const payload = await parseJson<BackendMeResponse>(response);
  if (payload?.authenticated && payload.user?.id) {
    return payload.user;
  }
  return null;
};

export const refreshBackendSession = async (): Promise<boolean> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(resolveBackendUrl(AUTH_REFRESH_PATH), {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const loadBackendSessionUser = async (
  options?: { allowRefresh?: boolean }
): Promise<BackendAuthUser | null> => {
  const allowRefresh = options?.allowRefresh ?? true;
  const directUser = await fetchBackendMe();
  if (directUser || !allowRefresh) {
    return directUser;
  }

  const refreshed = await refreshBackendSession();
  if (!refreshed) {
    return null;
  }

  return fetchBackendMe();
};

