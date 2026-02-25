const API_BASE_KEY = "focus_api_base";
const SESSION_CTX_KEY = "focus_session_ctx";
const WORK_GUIDE_DEFAULT_MAX_STEPS = 3;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureApiBase(value) {
  const cleaned = trimTrailingSlash(value);
  if (!cleaned) return "http://127.0.0.1:8000/api";
  if (cleaned.endsWith("/api")) return cleaned;
  return `${cleaned}/api`;
}

function workGuideDomPlanUrl(apiBase) {
  return `${ensureApiBase(apiBase)}/work-guide/plan/dom`;
}

function workGuideScreenshotPlanUrl(apiBase) {
  return `${ensureApiBase(apiBase)}/work-guide/plan/screenshot`;
}

function workGuideConfirmLogUrl(apiBase) {
  return `${ensureApiBase(apiBase)}/work-guide/logs/confirm`;
}

async function getApiBase() {
  const stored = await chrome.storage.local.get(API_BASE_KEY);
  return ensureApiBase(stored[API_BASE_KEY] || "http://127.0.0.1:8000/api");
}

async function getSessionContext() {
  const stored = await chrome.storage.local.get(SESSION_CTX_KEY);
  return stored[SESSION_CTX_KEY] || null;
}

async function sendEvent(type, payload, source = "extension") {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.session_id || !ctx.user_id || !ctx.device_id) return;

  const apiBase = await getApiBase();
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    ts: Date.now(),
    user_id: ctx.user_id,
    device_id: ctx.device_id,
    session_id: ctx.session_id,
    source,
    type,
    payload,
  };

  try {
    await fetch(`${apiBase}/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [event] }),
    });
  } catch {
    // Ignore transient extension network errors.
  }
}

async function requestWorkGuideDomPlan(payload) {
  const apiBase = await getApiBase();
  const response = await fetch(workGuideDomPlanUrl(apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return await response.json();
}

async function captureVisibleScreenshotDataUrl(sender) {
  const windowId = Number.isFinite(sender?.tab?.windowId) ? sender.tab.windowId : undefined;
  return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

async function requestWorkGuideScreenshotPlan(payload, sender) {
  const screenshotDataUrl = await captureVisibleScreenshotDataUrl(sender);
  const apiBase = await getApiBase();

  const body = {
    goal: payload?.goal || "",
    screenshot_base64: screenshotDataUrl,
    locale: payload?.locale || "ko-KR",
    context_text: payload?.context_text || undefined,
    step_index: payload?.step_index || 1,
    max_steps: payload?.max_steps || 3,
  };

  const response = await fetch(workGuideScreenshotPlanUrl(apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return await response.json();
}

async function logWorkGuideConfirm(payload) {
  const apiBase = await getApiBase();
  const response = await fetch(workGuideConfirmLogUrl(apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return await response.json();
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await sendEvent("activity", {
    idle_seconds: 0,
    tab_visible: true,
    window_focused: true,
    active_tab_id: tabId,
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    await sendEvent("activity", {
      idle_seconds: 0,
      tab_visible: true,
      window_focused: true,
      updated_tab_id: tabId,
      url: tab.url || "",
    });
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await sendEvent("activity", {
    idle_seconds: 0,
    tab_visible: true,
    window_focused: windowId !== chrome.windows.WINDOW_ID_NONE,
  });
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (newState) => {
  await sendEvent("activity", {
    idle_seconds: newState === "active" ? 0 : 65,
    tab_visible: true,
    window_focused: newState === "active",
    idle_state: newState,
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.tabs
    .sendMessage(tab.id, {
      type: "WORK_GUIDE_TRIGGER",
      payload: { max_steps: WORK_GUIDE_DEFAULT_MAX_STEPS },
    })
    .catch(() => {
      // Ignore unsupported pages (chrome:// etc).
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FOCUS_SET_SESSION_CONTEXT") {
    chrome.storage.local.set({ [SESSION_CTX_KEY]: message.payload }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "FOCUS_SET_API_BASE") {
    chrome.storage.local.set({ [API_BASE_KEY]: message.payload?.api_base }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "WORK_GUIDE_PLAN_DOM_REQUEST") {
    requestWorkGuideDomPlan(message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "WORK_GUIDE_PLAN_SCREENSHOT_REQUEST") {
    requestWorkGuideScreenshotPlan(message.payload, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "WORK_GUIDE_LOG_CONFIRM_REQUEST") {
    logWorkGuideConfirm(message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});
