function postSignal(payload) {
  window.postMessage(
    {
      source: "eft-focus-extension",
      type: "EXTENSION_ACTIVITY_SIGNAL",
      payload,
    },
    "*",
  );
}

document.addEventListener("visibilitychange", () => {
  postSignal({
    tab_visible: document.visibilityState === "visible",
    window_focused: document.hasFocus(),
    idle_seconds: 0,
  });
});

window.addEventListener("focus", () => {
  postSignal({ tab_visible: true, window_focused: true, idle_seconds: 0 });
});

window.addEventListener("blur", () => {
  postSignal({
    tab_visible: document.visibilityState === "visible",
    window_focused: false,
    idle_seconds: 61,
  });
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== "FOCUS_SESSION_CONTEXT") return;

  chrome.runtime.sendMessage({
    type: "FOCUS_SET_SESSION_CONTEXT",
    payload: data.payload,
  });
  if (data.payload?.api_base) {
    chrome.runtime.sendMessage({
      type: "FOCUS_SET_API_BASE",
      payload: { api_base: data.payload.api_base },
    });
  }
});

const DOM_INTERACTIVE_QUERY = [
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[role='button']",
  "[role='link']",
  "[tabindex]",
].join(",");

const WORK_GUIDE_LIMIT = 200;

const workGuideState = {
  active: false,
  goal: "",
  contextText: "",
  stepIndex: 1,
  maxSteps: 3,
  loading: false,
  status: "",
  stepPlan: null,
  targetRect: null,
  fallbackCandidates: [],
  showCandidatePicker: false,
  manualTarget: null,
};

const overlay = {
  root: null,
  box: null,
  badge: null,
  line: null,
  panel: null,
};

let layoutIntervalId = null;
let layoutListenersAttached = false;

function clipText(text, maxLen) {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function querySelectorSafe(selector) {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function buildPathHint(el) {
  const parts = [];
  let current = el;
  let depth = 0;
  while (current && depth < 4) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : "";
    const cls = current.classList.length > 0 ? `.${Array.from(current.classList).slice(0, 2).join(".")}` : "";
    parts.unshift(`${tag}${id}${cls}`);
    current = current.parentElement;
    depth += 1;
  }
  return parts.join(" > ").slice(0, 400);
}

function domNodeFromElement(el, index) {
  const ariaLabel = el.getAttribute("aria-label") || undefined;
  const role = el.getAttribute("role") || undefined;
  const classes = Array.from(el.classList).slice(0, 8);
  const text = clipText(ariaLabel || el.innerText || el.textContent || el.getAttribute("value") || "", 300);
  return {
    id: el.id || `wg-node-${index}`,
    text,
    role,
    ariaLabel,
    tag: el.tagName.toLowerCase(),
    classes,
    pathHint: buildPathHint(el),
  };
}

function collectDomSummary(limit) {
  const max = Number.isFinite(limit) ? limit : WORK_GUIDE_LIMIT;
  const elements = Array.from(document.querySelectorAll(DOM_INTERACTIVE_QUERY));
  const out = [];
  const seen = new Set();

  for (const el of elements) {
    if (out.length >= max) break;
    if (!(el instanceof HTMLElement)) continue;
    if (seen.has(el)) continue;
    if (!isVisible(el)) continue;
    if (el.hasAttribute("disabled")) continue;
    if (el.closest("[data-work-guide-ignore='1']")) continue;
    seen.add(el);
    out.push(domNodeFromElement(el, out.length + 1));
  }

  return out.slice(0, max);
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

function fallbackStepPlan(goal, stepIndex, maxSteps) {
  return {
    mode: "dom",
    goal,
    step_index: stepIndex,
    total_steps_hint: Math.max(3, maxSteps),
    steps: [
      {
        id: `s${stepIndex}`,
        title: `${stepIndex}단계`,
        instruction: `현재 화면에서 '${goal}'와 가장 관련된 버튼/링크를 직접 클릭해 주세요. 자동 클릭은 하지 않습니다.`,
        target: { type: "text_hint", text_hint: goal },
        fallback: { type: "bbox" },
        confirm: { needed: true, question: "이 단계가 맞나요?" },
        candidates: [
          { label: "후보 1", confidence: 0.5 },
          { label: "후보 2", confidence: 0.45 },
        ],
      },
    ],
  };
}

function getCurrentStep() {
  return workGuideState.stepPlan?.steps?.[0] || null;
}

function resolveTargetElement(step) {
  if (!step) return null;
  if (workGuideState.manualTarget && isVisible(workGuideState.manualTarget)) {
    return workGuideState.manualTarget;
  }
  const direct = querySelectorSafe(step.target?.selector);
  if (direct && direct instanceof HTMLElement) return direct;
  const list = Array.isArray(step.candidates) ? step.candidates : [];
  for (const item of list) {
    const byCandidate = querySelectorSafe(item?.selector);
    if (byCandidate && byCandidate instanceof HTMLElement) return byCandidate;
  }
  return null;
}

function tokenizeHints(step) {
  const raw = [];
  if (step?.target?.text_hint) raw.push(step.target.text_hint);
  const list = Array.isArray(step?.candidates) ? step.candidates : [];
  for (const item of list) {
    if (item?.label) raw.push(item.label);
  }
  return raw
    .join(" ")
    .toLowerCase()
    .split(/[\s,./()]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 20);
}

function findTextCandidates(step) {
  const tokens = tokenizeHints(step);
  if (tokens.length === 0) return [];

  const elements = Array.from(document.querySelectorAll(DOM_INTERACTIVE_QUERY));
  const scored = [];
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isVisible(el)) continue;
    if (el.closest("[data-work-guide-ignore='1']")) continue;
    const text = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`.toLowerCase();
    if (!text.trim()) continue;
    let score = 0;
    for (const token of tokens) {
      if (text.includes(token)) score += 1;
    }
    if (score > 0) {
      scored.push({
        score,
        el,
        label: clipText(el.getAttribute("aria-label") || el.innerText || "candidate", 80),
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2);
}

function removeOverlay() {
  if (overlay.root && overlay.root.parentElement) {
    overlay.root.parentElement.removeChild(overlay.root);
  }
  overlay.root = null;
  overlay.box = null;
  overlay.badge = null;
  overlay.line = null;
  overlay.panel = null;
}

function stopLayoutWatcher() {
  if (layoutIntervalId) {
    window.clearInterval(layoutIntervalId);
    layoutIntervalId = null;
  }
  if (layoutListenersAttached) {
    window.removeEventListener("resize", updateOverlay, true);
    window.removeEventListener("scroll", updateOverlay, true);
    layoutListenersAttached = false;
  }
}

function closeWorkGuide() {
  workGuideState.active = false;
  workGuideState.loading = false;
  workGuideState.status = "";
  workGuideState.stepPlan = null;
  workGuideState.targetRect = null;
  workGuideState.fallbackCandidates = [];
  workGuideState.manualTarget = null;
  workGuideState.showCandidatePicker = false;
  stopLayoutWatcher();
  removeOverlay();
}

function createOverlayIfNeeded() {
  if (overlay.root) return;

  const root = document.createElement("div");
  root.setAttribute("data-work-guide-ignore", "1");
  root.id = "eft-work-guide-overlay-root";
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  root.style.pointerEvents = "none";

  const dim = document.createElement("div");
  dim.style.position = "absolute";
  dim.style.inset = "0";
  dim.style.background = "rgba(0, 0, 0, 0.35)";

  const box = document.createElement("div");
  box.style.position = "absolute";
  box.style.border = "4px solid #ef4444";
  box.style.borderRadius = "8px";
  box.style.boxSizing = "border-box";
  box.style.display = "none";

  const badge = document.createElement("div");
  badge.style.position = "absolute";
  badge.style.width = "30px";
  badge.style.height = "30px";
  badge.style.borderRadius = "999px";
  badge.style.background = "#ef4444";
  badge.style.color = "#ffffff";
  badge.style.fontWeight = "700";
  badge.style.fontSize = "14px";
  badge.style.display = "none";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.fontFamily = "Segoe UI, system-ui, -apple-system, sans-serif";
  badge.textContent = "1";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.pointerEvents = "none";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "eft-work-guide-arrow-head");
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("refX", "10");
  marker.setAttribute("refY", "3.5");
  marker.setAttribute("orient", "auto");
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
  polygon.setAttribute("fill", "#ef4444");
  marker.appendChild(polygon);
  defs.appendChild(marker);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("stroke", "#ef4444");
  line.setAttribute("stroke-width", "3");
  line.setAttribute("marker-end", "url(#eft-work-guide-arrow-head)");
  line.style.display = "none";
  svg.appendChild(defs);
  svg.appendChild(line);

  const panel = document.createElement("div");
  panel.setAttribute("data-work-guide-ignore", "1");
  panel.style.position = "absolute";
  panel.style.left = "50%";
  panel.style.transform = "translateX(-50%)";
  panel.style.bottom = "16px";
  panel.style.width = "min(92vw, 780px)";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid #d6dbe3";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 12px 28px rgba(15, 23, 42, 0.2)";
  panel.style.padding = "14px";
  panel.style.pointerEvents = "auto";
  panel.style.fontFamily = "Segoe UI, system-ui, -apple-system, sans-serif";

  root.appendChild(dim);
  root.appendChild(svg);
  root.appendChild(box);
  root.appendChild(badge);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  overlay.root = root;
  overlay.box = box;
  overlay.badge = badge;
  overlay.line = line;
  overlay.panel = panel;
}

function updateStepTargetState() {
  const step = getCurrentStep();
  if (!step) {
    workGuideState.targetRect = null;
    workGuideState.fallbackCandidates = [];
    return;
  }
  const target = resolveTargetElement(step);
  if (target) {
    workGuideState.targetRect = target.getBoundingClientRect();
    workGuideState.fallbackCandidates = [];
    return;
  }
  workGuideState.targetRect = null;
  workGuideState.fallbackCandidates = findTextCandidates(step);
}

function updateGeometry() {
  if (!overlay.box || !overlay.badge || !overlay.line) return;
  const rect = workGuideState.targetRect;
  if (!rect) {
    overlay.box.style.display = "none";
    overlay.badge.style.display = "none";
    overlay.line.style.display = "none";
    return;
  }

  const left = Math.max(0, rect.left - 2);
  const top = Math.max(0, rect.top - 2);
  const width = Math.max(16, rect.width + 4);
  const height = Math.max(16, rect.height + 4);

  overlay.box.style.display = "block";
  overlay.box.style.left = `${left}px`;
  overlay.box.style.top = `${top}px`;
  overlay.box.style.width = `${width}px`;
  overlay.box.style.height = `${height}px`;

  overlay.badge.style.display = "flex";
  overlay.badge.style.left = `${Math.max(6, rect.left - 10)}px`;
  overlay.badge.style.top = `${Math.max(6, rect.top - 10)}px`;
  overlay.badge.textContent = String(workGuideState.stepIndex || 1);

  const x2 = rect.left + rect.width / 2;
  const y2 = rect.top + rect.height / 2;
  const x1 = Math.max(16, rect.left - 120);
  const y1 = Math.max(16, rect.top - 92);
  overlay.line.style.display = "block";
  overlay.line.setAttribute("x1", String(Math.round(x1)));
  overlay.line.setAttribute("y1", String(Math.round(y1)));
  overlay.line.setAttribute("x2", String(Math.round(x2)));
  overlay.line.setAttribute("y2", String(Math.round(y2)));
}

function confirmBlockHtml(step) {
  if (!step?.confirm?.needed) return "";
  const question = escapeHtml(step.confirm.question || "이 요소가 맞나요?");
  const candidateButtons = workGuideState.showCandidatePicker
    ? (step.candidates || [])
        .slice(0, 2)
        .map(
          (item, index) =>
            `<button data-wg-candidate-index="${index}" style="padding:6px 10px;border-radius:8px;border:1px solid #7dd3fc;background:#fff;color:#075985;font-size:13px;cursor:pointer;">${escapeHtml(
              item.label || `후보 ${index + 1}`,
            )}</button>`,
        )
        .join("")
    : "";

  return `
    <div style="margin-top:10px;padding:10px;border:1px solid #bae6fd;border-radius:8px;background:#f0f9ff;">
      <p style="margin:0 0 8px;font-size:13px;color:#0c4a6e;">${question}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button data-wg-confirm="yes" style="padding:6px 10px;border-radius:8px;border:0;background:#0369a1;color:#fff;font-size:13px;cursor:pointer;">예</button>
        <button data-wg-toggle-candidates="1" style="padding:6px 10px;border-radius:8px;border:1px solid #7dd3fc;background:#fff;color:#075985;font-size:13px;cursor:pointer;">아니오, 후보 선택</button>
      </div>
      ${candidateButtons ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${candidateButtons}</div>` : ""}
    </div>
  `;
}

function textFallbackHtml() {
  if (workGuideState.targetRect || workGuideState.fallbackCandidates.length === 0) return "";
  const buttons = workGuideState.fallbackCandidates
    .map(
      (item, index) =>
        `<button data-wg-text-candidate-index="${index}" style="padding:6px 10px;border-radius:8px;border:1px solid #fcd34d;background:#fff;color:#92400e;font-size:13px;cursor:pointer;">${escapeHtml(
          item.label || `텍스트 후보 ${index + 1}`,
        )}</button>`,
    )
    .join("");
  return `
    <div style="margin-top:10px;padding:10px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;">
      <p style="margin:0 0 8px;font-size:12px;color:#92400e;">selector 매칭 실패. 텍스트 매칭 후보를 보여줍니다.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${buttons}</div>
    </div>
  `;
}

function bindPanelEvents() {
  if (!overlay.panel) return;

  const closeBtn = overlay.panel.querySelector("[data-wg-close='1']");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeWorkGuide();
    });
  }

  const nextBtn = overlay.panel.querySelector("[data-wg-next='1']");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      void handleNextStep();
    });
  }

  const toggleBtn = overlay.panel.querySelector("[data-wg-toggle-candidates='1']");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      workGuideState.showCandidatePicker = !workGuideState.showCandidatePicker;
      renderOverlay();
    });
  }

  const confirmYesBtn = overlay.panel.querySelector("[data-wg-confirm='yes']");
  if (confirmYesBtn) {
    confirmYesBtn.addEventListener("click", () => {
      void logConfirm("yes");
    });
  }

  const candidateButtons = Array.from(overlay.panel.querySelectorAll("[data-wg-candidate-index]"));
  for (const btn of candidateButtons) {
    btn.addEventListener("click", (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const indexValue = Number(target.dataset.wgCandidateIndex || "-1");
      if (indexValue < 0) return;
      void chooseServerCandidate(indexValue);
    });
  }

  const textCandidateButtons = Array.from(overlay.panel.querySelectorAll("[data-wg-text-candidate-index]"));
  for (const btn of textCandidateButtons) {
    btn.addEventListener("click", (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const idx = Number(target.dataset.wgTextCandidateIndex || "-1");
      const row = workGuideState.fallbackCandidates[idx];
      if (!row || !(row.el instanceof HTMLElement)) return;
      workGuideState.manualTarget = row.el;
      row.el.scrollIntoView({ block: "center", behavior: "smooth" });
      updateOverlay();
    });
  }
}

function renderOverlay() {
  if (!workGuideState.active) return;
  createOverlayIfNeeded();
  updateStepTargetState();
  updateGeometry();

  const stepPlan = workGuideState.stepPlan;
  const step = getCurrentStep();
  if (!overlay.panel || !stepPlan || !step) return;

  const progress = `단계 ${stepPlan.step_index} / ${Math.max(3, stepPlan.total_steps_hint || workGuideState.maxSteps)}`;
  const title = escapeHtml(step.title || `${workGuideState.stepIndex}단계`);
  const instruction = escapeHtml(step.instruction || "다음 동작을 클릭해 주세요.");
  const status = workGuideState.status
    ? `<p style="margin:8px 0 0;padding:8px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-size:12px;">${escapeHtml(workGuideState.status)}</p>`
    : "";

  overlay.panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div>
        <p style="margin:0;font-size:12px;color:#64748b;">${progress}</p>
        <h3 style="margin:2px 0 0;font-size:16px;color:#0f172a;">${title}</h3>
      </div>
      <button data-wg-close="1" style="padding:4px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-size:12px;cursor:pointer;">닫기</button>
    </div>
    <p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#1e293b;">${instruction}</p>
    ${status}
    ${textFallbackHtml()}
    ${confirmBlockHtml(step)}
    <div style="display:flex;justify-content:flex-end;margin-top:10px;">
      <button data-wg-next="1" ${workGuideState.loading ? "disabled" : ""} style="padding:8px 12px;border-radius:8px;border:0;background:${workGuideState.loading ? "#94a3b8" : "#0f172a"};color:#fff;font-size:13px;cursor:${workGuideState.loading ? "default" : "pointer"};">
        ${workGuideState.loading ? "생성 중..." : "다음"}
      </button>
    </div>
  `;

  bindPanelEvents();
}

function updateOverlay() {
  if (!workGuideState.active) return;
  updateStepTargetState();
  updateGeometry();
}

function ensureLayoutWatcher() {
  if (layoutListenersAttached) return;
  window.addEventListener("resize", updateOverlay, true);
  window.addEventListener("scroll", updateOverlay, true);
  layoutListenersAttached = true;

  layoutIntervalId = window.setInterval(() => {
    updateOverlay();
  }, 500);
}

async function requestDomStep(stepIndex) {
  workGuideState.loading = true;
  workGuideState.stepIndex = stepIndex;
  workGuideState.status = "";
  workGuideState.showCandidatePicker = false;
  workGuideState.manualTarget = null;
  renderOverlay();

  const payload = {
    goal: workGuideState.goal,
    url: window.location.href,
    dom_summary: collectDomSummary(WORK_GUIDE_LIMIT),
    locale: "ko-KR",
    context_text: workGuideState.contextText || undefined,
    step_index: stepIndex,
    max_steps: workGuideState.maxSteps,
  };

  try {
    const response = await sendRuntimeMessage({
      type: "WORK_GUIDE_PLAN_DOM_REQUEST",
      payload,
    });
    if (!response || !response.ok || !response.data?.step_plan) {
      const message = response?.error || "work guide response is empty";
      throw new Error(String(message));
    }
    workGuideState.stepPlan = response.data.step_plan;
  } catch (error) {
    workGuideState.status = `API 호출 실패. 텍스트 fallback 가이드 사용: ${String(error?.message || error)}`;
    workGuideState.stepPlan = fallbackStepPlan(workGuideState.goal, stepIndex, workGuideState.maxSteps);
  } finally {
    workGuideState.loading = false;
    renderOverlay();
  }
}

async function handleNextStep() {
  if (workGuideState.loading) return;
  const next = (workGuideState.stepIndex || 1) + 1;
  if (next > workGuideState.maxSteps) {
    workGuideState.status = `총 ${workGuideState.maxSteps}단계 안내를 완료했습니다.`;
    renderOverlay();
    return;
  }
  await requestDomStep(next);
}

async function logConfirm(answer, selectedCandidateIndex) {
  const step = getCurrentStep();
  if (!step) return;
  try {
    await sendRuntimeMessage({
      type: "WORK_GUIDE_LOG_CONFIRM_REQUEST",
      payload: {
        goal: workGuideState.goal,
        mode: "dom",
        step_id: step.id,
        confirm_needed: !!step.confirm?.needed,
        confirm_answer: answer,
        selected_candidate_index: selectedCandidateIndex,
      },
    });
  } catch {
    // Logging failure should not block the guide.
  }
}

async function chooseServerCandidate(index) {
  const step = getCurrentStep();
  if (!step) return;
  const item = (step.candidates || [])[index];
  if (item?.selector) {
    const el = querySelectorSafe(item.selector);
    if (el && el instanceof HTMLElement) {
      workGuideState.manualTarget = el;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      workGuideState.status = "선택한 후보 selector를 현재 화면에서 찾지 못했습니다.";
    }
  }
  await logConfirm("no", index);
  workGuideState.showCandidatePicker = false;
  renderOverlay();
}

async function startWorkGuide(input) {
  const goal = clipText(input?.goal || "", 500);
  if (!goal) return { ok: false, error: "목표를 입력해 주세요." };

  workGuideState.active = true;
  workGuideState.goal = goal;
  workGuideState.contextText = clipText(input?.contextText || "", 1000);
  workGuideState.stepIndex = 1;
  workGuideState.maxSteps = Math.max(1, Math.min(10, Number(input?.maxSteps) || 3));
  workGuideState.status = "";
  workGuideState.stepPlan = fallbackStepPlan(goal, 1, workGuideState.maxSteps);
  workGuideState.showCandidatePicker = false;
  workGuideState.manualTarget = null;

  createOverlayIfNeeded();
  ensureLayoutWatcher();
  renderOverlay();
  await requestDomStep(1);
  return { ok: true };
}

async function startWorkGuideFromPrompt(maxSteps) {
  const goalInput = window.prompt("막힌 업무 목표를 한 문장으로 입력해 주세요.", workGuideState.goal || "");
  const goal = clipText(goalInput || "", 500);
  if (!goal) return;

  const contextInput = window.prompt(
    "현재 상황을 짧게 입력해 주세요. (선택)\n예: 로그인 완료, 설정 메뉴를 못 찾음",
    workGuideState.contextText || "",
  );

  await startWorkGuide({
    goal,
    contextText: clipText(contextInput || "", 1000),
    maxSteps,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "WORK_GUIDE_TRIGGER") {
    void startWorkGuideFromPrompt(message?.payload?.max_steps || 3);
    sendResponse?.({ ok: true });
    return true;
  }

  if (message?.type === "WORK_GUIDE_START") {
    startWorkGuide({
      goal: message?.payload?.goal || "",
      contextText: message?.payload?.context_text || "",
      maxSteps: message?.payload?.max_steps || 3,
    })
      .then((result) => sendResponse?.(result))
      .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "WORK_GUIDE_CLOSE") {
    closeWorkGuide();
    sendResponse?.({ ok: true });
    return true;
  }

  if (message?.type === "WORK_GUIDE_PING") {
    sendResponse?.({ ok: true });
    return true;
  }

  return false;
});
