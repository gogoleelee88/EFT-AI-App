import React, { useEffect, useMemo, useState } from "react";

import type { Step, StepPlan } from "@/types/workGuide";

type WorkGuideOverlayProps = {
  stepPlan: StepPlan | null;
  busy?: boolean;
  onNext: () => void;
  onClose: () => void;
  onConfirm: (answer: "yes" | "no", selectedCandidateIndex?: number) => void;
};

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

type TextMatchCandidate = {
  index: number;
  label: string;
  el: HTMLElement;
  rect: DOMRect;
};

function querySelectorSafe(selector?: string | null): HTMLElement | null {
  if (!selector) return null;
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function resolveTargetElement(step: Step): HTMLElement | null {
  const direct = querySelectorSafe(step.target.selector);
  if (direct) return direct;
  for (const candidate of step.candidates) {
    const el = querySelectorSafe(candidate.selector);
    if (el) return el;
  }
  return null;
}

function textCandidates(step: Step): TextMatchCandidate[] {
  const hintTokens = [step.target.text_hint || "", ...step.candidates.map((item) => item.label || "")]
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  if (hintTokens.length === 0) return [];

  const elements = Array.from(document.querySelectorAll<HTMLElement>(DOM_INTERACTIVE_QUERY));
  const scored: Array<{ score: number; el: HTMLElement }> = [];
  for (const el of elements) {
    if (!isVisible(el)) continue;
    if (el.dataset.workGuideIgnore === "1") continue;
    const text = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`.trim().toLowerCase();
    if (!text) continue;
    let score = 0;
    for (const token of hintTokens) {
      if (token && text.includes(token)) score += 1;
    }
    if (score > 0) scored.push({ score, el });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((item, idx) => ({
    index: idx,
    label: (item.el.getAttribute("aria-label") || item.el.innerText || "후보").trim().slice(0, 80),
    el: item.el,
    rect: item.el.getBoundingClientRect(),
  }));
}

const WorkGuideOverlay: React.FC<WorkGuideOverlayProps> = ({ stepPlan, busy = false, onNext, onClose, onConfirm }) => {
  const step = stepPlan?.steps?.[0] || null;
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [fallbackCandidates, setFallbackCandidates] = useState<TextMatchCandidate[]>([]);
  const [showCandidatePicker, setShowCandidatePicker] = useState(false);

  useEffect(() => {
    if (!step) {
      setTargetRect(null);
      setFallbackCandidates([]);
      return;
    }

    const update = () => {
      const el = resolveTargetElement(step);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
        setFallbackCandidates([]);
        return;
      }
      setTargetRect(null);
      setFallbackCandidates(textCandidates(step));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const interval = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(interval);
    };
  }, [step]);

  const arrowSvg = useMemo(() => {
    if (!targetRect) return null;
    const x2 = targetRect.left + targetRect.width / 2;
    const y2 = targetRect.top + targetRect.height / 2;
    const x1 = Math.max(16, targetRect.left - 120);
    const y1 = Math.max(16, targetRect.top - 100);
    return (
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-[9998]">
        <defs>
          <marker id="wg-arrow-head" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
          </marker>
        </defs>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ef4444" strokeWidth="3" markerEnd="url(#wg-arrow-head)" />
      </svg>
    );
  }, [targetRect]);

  if (!stepPlan || !step) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute inset-0 bg-black/35" />

      {targetRect && (
        <>
          <div
            className="absolute border-4 border-red-500 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]"
            style={{
              left: Math.max(0, targetRect.left - 2),
              top: Math.max(0, targetRect.top - 2),
              width: Math.max(16, targetRect.width + 4),
              height: Math.max(16, targetRect.height + 4),
            }}
          />
          <div
            className="absolute w-8 h-8 rounded-full bg-red-500 text-white font-bold text-sm flex items-center justify-center"
            style={{ left: Math.max(6, targetRect.left - 10), top: Math.max(6, targetRect.top - 10) }}
          >
            1
          </div>
          {arrowSvg}
        </>
      )}

      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-4 w-[min(92vw,760px)] bg-white rounded-xl border border-slate-200 shadow-xl p-4 space-y-3 pointer-events-auto"
        data-work-guide-ignore="1"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">
              단계 {stepPlan.step_index} / {Math.max(3, stepPlan.total_steps_hint)}
            </p>
            <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>

        <p className="text-sm text-slate-800 leading-6">{step.instruction}</p>

        {!targetRect && fallbackCandidates.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs text-amber-800">selector로 요소를 찾지 못해 텍스트 매칭 후보를 보여줍니다.</p>
            <div className="flex flex-wrap gap-2">
              {fallbackCandidates.map((item) => (
                <button
                  key={`${item.index}-${item.label}`}
                  type="button"
                  className="px-3 py-1.5 rounded bg-white border border-amber-300 text-amber-900 text-sm"
                  onClick={() => {
                    item.el.scrollIntoView({ block: "center", behavior: "smooth" });
                    setTargetRect(item.rect);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.confirm.needed && (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 space-y-2">
            <p className="text-sm text-sky-900">{step.confirm.question || "이 요소가 맞나요?"}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm"
                onClick={() => onConfirm("yes")}
              >
                예
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-sky-400 text-sky-800 bg-white text-sm"
                onClick={() => setShowCandidatePicker((prev) => !prev)}
              >
                아니오, 후보 선택
              </button>
            </div>
            {showCandidatePicker && step.candidates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {step.candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.label}-${index}`}
                    type="button"
                    className="px-3 py-1.5 rounded bg-white border border-sky-300 text-sky-900 text-sm"
                    onClick={() => onConfirm("no", index)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
            onClick={onNext}
            disabled={busy}
          >
            {busy ? "생성 중..." : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkGuideOverlay;
