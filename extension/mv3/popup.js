const API_BASE_KEY = "focus_api_base";
const DEFAULT_API_BASE = "http://127.0.0.1:8000/api";

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE;
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

function setStatus(text, type) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("ok", "err");
  if (type === "ok") el.classList.add("ok");
  if (type === "err") el.classList.add("err");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
}

function isUnsupportedUrl(url) {
  const value = String(url || "");
  return value.startsWith("chrome://") || value.startsWith("edge://") || value.startsWith("about:");
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("활성 탭을 찾지 못했습니다.");
  if (isUnsupportedUrl(tab.url)) {
    throw new Error("이 페이지에서는 확장이 동작하지 않습니다. 일반 웹페이지에서 실행해 주세요.");
  }
  return await chrome.tabs.sendMessage(tab.id, message);
}

async function init() {
  const stored = await chrome.storage.local.get(API_BASE_KEY);
  const apiBaseInput = document.getElementById("apiBase");
  if (apiBaseInput) {
    apiBaseInput.value = normalizeApiBase(stored[API_BASE_KEY] || DEFAULT_API_BASE);
  }
}

async function startGuide() {
  const goalEl = document.getElementById("goal");
  const contextEl = document.getElementById("context");
  const stepsEl = document.getElementById("steps");
  const apiBaseEl = document.getElementById("apiBase");
  const startBtn = document.getElementById("startBtn");

  const goal = String(goalEl?.value || "").trim();
  if (!goal) {
    setStatus("목표를 입력해 주세요.", "err");
    return;
  }

  const contextText = String(contextEl?.value || "").trim();
  const maxSteps = Math.max(1, Math.min(10, Number(stepsEl?.value || "3")));
  const apiBase = normalizeApiBase(apiBaseEl?.value || DEFAULT_API_BASE);

  startBtn.disabled = true;
  setStatus("가이드를 시작하는 중...", "");
  try {
    await chrome.storage.local.set({ [API_BASE_KEY]: apiBase });
    const response = await sendToActiveTab({
      type: "WORK_GUIDE_START",
      payload: {
        goal,
        context_text: contextText,
        max_steps: maxSteps,
      },
    });
    if (response?.ok !== true) {
      throw new Error(response?.error || "현재 탭에서 가이드를 시작하지 못했습니다.");
    }
    setStatus("오버레이를 시작했습니다.", "ok");
    setTimeout(() => window.close(), 250);
  } catch (error) {
    setStatus(String(error?.message || error), "err");
  } finally {
    startBtn.disabled = false;
  }
}

async function closeGuide() {
  const closeBtn = document.getElementById("closeBtn");
  closeBtn.disabled = true;
  setStatus("오버레이 종료 요청 중...", "");
  try {
    await sendToActiveTab({ type: "WORK_GUIDE_CLOSE" });
    setStatus("오버레이를 닫았습니다.", "ok");
    setTimeout(() => window.close(), 200);
  } catch (error) {
    setStatus(String(error?.message || error), "err");
  } finally {
    closeBtn.disabled = false;
  }
}

document.getElementById("startBtn")?.addEventListener("click", () => {
  void startGuide();
});

document.getElementById("closeBtn")?.addEventListener("click", () => {
  void closeGuide();
});

void init();
