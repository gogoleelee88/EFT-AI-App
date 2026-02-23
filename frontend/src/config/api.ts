const trimSlash = (v: string) => v.trim().replace(/\/+$/, "");
const toWsOrigin = (base: string): string => {
  if (!base) return "";
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}`;
  return "";
};

const inferLocalApi = () =>
  `http://${typeof window === "undefined" ? "localhost" : window.location.hostname}:8000`;

const PROD_DEFAULT = "https://eft-ai-app.onrender.com";
const DEV_DEFAULT = inferLocalApi();

const raw = trimSlash(
  `${import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_PRODUCTION_ORIGIN || ""}`
);
const API_BASE_URL = raw || (import.meta.env.PROD ? PROD_DEFAULT : DEV_DEFAULT);

export const API_CONFIG = {
  API_BASE_URL,
  VLLM_ENGINE_A_URL: trimSlash(import.meta.env.VITE_VLLM_ENGINE_A_URL || `${API_BASE_URL}/v1`),
  VLLM_ENGINE_B_URL: trimSlash(import.meta.env.VITE_VLLM_ENGINE_B_URL || `${API_BASE_URL}/v1`),
  WS_URL: `${toWsOrigin(API_BASE_URL)}/api/ws`,
};

export const resolveBackendUrl = (path: string) => {
  const normalizedInput = path.trim()
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(normalizedInput)) {
    return normalizedInput
  }
  const normalizedPath = normalizedInput.startsWith("/") ? normalizedInput : `/${normalizedInput}`;
  return `${API_CONFIG.API_BASE_URL}${normalizedPath}`;
};

export const isApiPath = (pathname: string) =>
  ["/api", "/v1", "/suds", "/ws", "/health"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

export const safeFrontendOrigin = () =>
  (typeof window === "undefined" ? "" : `${window.location.origin}`).replace(/\/+$/, "");
