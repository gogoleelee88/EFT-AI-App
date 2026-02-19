import type {
  DomNode,
  DomPlanRequest,
  DomPlanResponse,
  ScreenshotPlanRequest,
  ScreenshotPlanResponse,
  WorkGuideConfirmLogRequest,
} from "@/types/workGuide";

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

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function clipText(text: string, maxLen: number): string {
  const value = (text || "").trim().replace(/\s+/g, " ");
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function buildPathHint(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
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

function domNodeFromElement(el: HTMLElement, index: number): DomNode {
  const aria = el.getAttribute("aria-label") || undefined;
  const role = el.getAttribute("role") || undefined;
  const classes = Array.from(el.classList).slice(0, 8);
  const text = clipText(aria || el.innerText || el.textContent || el.getAttribute("value") || "", 300);
  return {
    id: el.id || `wg-node-${index}`,
    text,
    role: role || undefined,
    ariaLabel: aria || undefined,
    tag: el.tagName.toLowerCase(),
    classes,
    pathHint: buildPathHint(el),
  };
}

export function collectDomSummary(limit = 200): DomNode[] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(DOM_INTERACTIVE_QUERY));
  const seen = new Set<HTMLElement>();
  const out: DomNode[] = [];
  for (const el of elements) {
    if (out.length >= limit) break;
    if (seen.has(el)) continue;
    if (!isVisible(el)) continue;
    if (el.hasAttribute("disabled")) continue;
    if (el.dataset.workGuideIgnore === "1") continue;
    seen.add(el);
    out.push(domNodeFromElement(el, out.length + 1));
  }
  return out.slice(0, limit);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function planDomStep(payload: DomPlanRequest): Promise<DomPlanResponse> {
  return requestJson<DomPlanResponse>("/api/work-guide/plan/dom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function planScreenshotStep(payload: ScreenshotPlanRequest): Promise<ScreenshotPlanResponse> {
  return requestJson<ScreenshotPlanResponse>("/api/work-guide/plan/screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function logWorkGuideConfirm(payload: WorkGuideConfirmLogRequest): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/work-guide/logs/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

