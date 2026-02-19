import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import WorkGuideOverlay from "@/components/work-guide/WorkGuideOverlay";
import { collectDomSummary, fileToBase64, logWorkGuideConfirm, planDomStep, planScreenshotStep } from "@/services/workGuideService";
import type { DomNode, GuideMode, StepPlan } from "@/types/workGuide";

type ModePref = "auto" | GuideMode;

const MAX_STEPS = 3;

function fallbackPlan(goal: string, mode: GuideMode, stepIndex: number): StepPlan {
  return {
    mode,
    goal,
    step_index: stepIndex,
    total_steps_hint: MAX_STEPS,
    steps: [
      {
        id: `s${stepIndex}`,
        title: `${stepIndex}단계`,
        instruction: `"${goal}"와 관련된 다음 버튼/링크를 찾아 직접 클릭해 주세요. 이 가이드는 자동 클릭/자동 제출을 하지 않습니다.`,
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

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[\s,./()]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .slice(0, 20);
}

function domRelevance(goal: string, dom: DomNode[]): number {
  const tokens = tokenize(goal);
  if (tokens.length === 0 || dom.length === 0) return 0;
  let score = 0;
  for (const node of dom) {
    const hay = `${node.text || ""} ${node.ariaLabel || ""} ${node.role || ""} ${node.pathHint || ""}`.toLowerCase();
    for (const token of tokens) {
      if (hay.includes(token)) score += 1;
    }
  }
  return score;
}

const WorkGuideDemoPage: React.FC = () => {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("현재 화면에서 막힌 업무를 단계별로 안내해줘");
  const [contextText, setContextText] = useState("");
  const [modePref, setModePref] = useState<ModePref>("auto");

  const [activeMode, setActiveMode] = useState<GuideMode | null>(null);
  const [stepPlan, setStepPlan] = useState<StepPlan | null>(null);
  const [stepIndex, setStepIndex] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);

  const [screenshotBase64, setScreenshotBase64] = useState("");
  const [annotatedImageBase64, setAnnotatedImageBase64] = useState<string | null>(null);
  const [showScreenshotCandidates, setShowScreenshotCandidates] = useState(false);
  const [showEmotionPrompt, setShowEmotionPrompt] = useState(true);

  const currentDom = useMemo(() => collectDomSummary(200), []);
  const currentDomCount = currentDom.length;

  const resolveAutoMode = (dom: DomNode[]): GuideMode => {
    const rel = domRelevance(goal, dom);
    if (rel >= 2) return "dom";
    return "screenshot";
  };

  const requestStep = async (nextStepIndex: number, forcedMode?: GuideMode) => {
    const domSummary = collectDomSummary(200);
    let mode: GuideMode;
    if (forcedMode) {
      mode = forcedMode;
    } else if (modePref === "dom" || modePref === "screenshot") {
      mode = modePref;
    } else {
      mode = resolveAutoMode(domSummary);
    }

    setActiveMode(mode);
    setLoading(true);
    setStatus("");
    setDone(false);
    setShowScreenshotCandidates(false);

    try {
      if (mode === "dom") {
        const rel = domRelevance(goal, domSummary);
        if (rel < 2) {
          setStatus("현재 페이지 DOM 관련도가 낮습니다. 정확한 안내를 위해 실제 화면 스크린샷 업로드를 권장합니다.");
          if (!screenshotBase64) {
            setStepPlan(fallbackPlan(goal, "dom", nextStepIndex));
            setAnnotatedImageBase64(null);
            return;
          }
          mode = "screenshot";
          setActiveMode("screenshot");
        }
      }

      if (mode === "dom") {
        const response = await planDomStep({
          goal,
          url: window.location.href,
          dom_summary: domSummary.slice(0, 200),
          locale: "ko-KR",
          context_text: contextText || undefined,
          step_index: nextStepIndex,
          max_steps: MAX_STEPS,
        });
        setStepPlan(response.step_plan);
        setAnnotatedImageBase64(null);
        return;
      }

      if (!screenshotBase64) {
        setStatus("스크린샷 모드는 실제 스크린샷 업로드가 필요합니다.");
        setStepPlan(fallbackPlan(goal, "screenshot", nextStepIndex));
        setAnnotatedImageBase64(null);
        return;
      }

      const response = await planScreenshotStep({
        goal,
        screenshot_base64: screenshotBase64,
        locale: "ko-KR",
        context_text: contextText || undefined,
        step_index: nextStepIndex,
        max_steps: MAX_STEPS,
      });
      setStepPlan(response.step_plan);
      setAnnotatedImageBase64(response.annotated_image_base64 || null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "가이드 생성 실패";
      setStatus(`API 호출에 실패해 텍스트 fallback 가이드를 표시합니다. ${message}`);
      setStepPlan(fallbackPlan(goal, mode, nextStepIndex));
      setAnnotatedImageBase64(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!goal.trim()) {
      setStatus("목표 문장을 입력해 주세요.");
      return;
    }
    const next = 1;
    setStepIndex(next);
    await requestStep(next);
  };

  const handleNext = async () => {
    const next = stepIndex + 1;
    if (next > MAX_STEPS) {
      setDone(true);
      setStatus("3단계 안내를 완료했습니다.");
      return;
    }
    setStepIndex(next);
    await requestStep(next, activeMode || undefined);
  };

  const logConfirm = async (answer: "yes" | "no", selectedCandidateIndex?: number) => {
    const step = stepPlan?.steps?.[0];
    if (!step || !activeMode) return;
    try {
      await logWorkGuideConfirm({
        goal,
        mode: activeMode,
        step_id: step.id,
        confirm_needed: !!step.confirm.needed,
        confirm_answer: answer,
        selected_candidate_index: selectedCandidateIndex,
      });
    } catch {
      // Keep UX stable even if logging fails.
    }
  };

  const currentStep = stepPlan?.steps?.[0];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      {showEmotionPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="팝업 배경"
            className="absolute inset-0 bg-black/45"
            onClick={() => setShowEmotionPrompt(false)}
          />
          <div className="relative w-full max-w-md rounded-xl bg-white border border-slate-200 p-5 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">작업이 막혔을 때 감정도 불편하지 않으세요?</h2>
            <p className="text-sm text-slate-700">
              감정관리하고 작업을 하면 조금 더 쉬워져요. 지금은 아래 버튼으로 먼저 감정 관리를 시작해보세요.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded border border-slate-300 text-slate-700 text-sm"
                onClick={() => setShowEmotionPrompt(false)}
              >
                닫기
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-slate-900 text-white text-sm"
                onClick={() => navigate("/eft-strict")}
              >
                감정관리하러 가기
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" data-work-guide-ignore="1">
          <h1 className="text-xl font-bold text-slate-900">업무 막힘 가이드</h1>
          <p className="text-sm text-slate-600">
            현재 실제 페이지 DOM 또는 업로드한 스크린샷을 기준으로 다음 클릭 단계를 안내합니다.
          </p>
          <p className="text-xs text-slate-500">
            보안 정책상 다른 도메인 백그라운드 탭 DOM은 읽을 수 없습니다. 외부 사이트는 스크린샷 모드를 권장합니다.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-sm text-slate-700">목표</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="예: 현재 화면에서 연말정산 PDF를 내려받고 싶어요"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-700">상황 설명 (선택)</span>
              <input
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="예: 로그인 완료, 메뉴를 못 찾겠어요"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={modePref}
              onChange={(e) => setModePref(e.target.value as ModePref)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="auto">자동</option>
              <option value="dom">DOM</option>
              <option value="screenshot">스크린샷</option>
            </select>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <span>스크린샷 파일</span>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const b64 = await fileToBase64(file);
                  setScreenshotBase64(b64);
                }}
                className="text-xs"
              />
            </label>

            <button
              type="button"
              onClick={handleStart}
              disabled={loading}
              className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
            >
              {loading ? "생성 중..." : "막힘 해결 시작"}
            </button>
          </div>

          <p className="text-xs text-slate-500">현재 페이지 interactive DOM 개수: {currentDomCount} (최대 200개 수집)</p>

          {status && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{status}</p>}
          {done && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">가이드가 완료되었습니다.</p>}
        </div>

        {activeMode === "screenshot" && stepPlan && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" data-work-guide-ignore="1">
            <h2 className="text-lg font-semibold text-slate-900">스크린샷 가이드</h2>
            {annotatedImageBase64 ? (
              <img
                src={`data:image/png;base64,${annotatedImageBase64}`}
                alt="annotated screenshot"
                className="w-full max-w-3xl rounded border border-slate-200"
              />
            ) : (
              <p className="text-sm text-slate-500">주석 이미지가 없어 텍스트 fallback 가이드를 사용합니다.</p>
            )}

            {currentStep && (
              <div className="rounded border border-slate-200 p-3 space-y-2">
                <p className="text-xs text-slate-500">
                  단계 {stepPlan.step_index} / {Math.max(3, stepPlan.total_steps_hint)}
                </p>
                <p className="text-sm font-semibold text-slate-900">{currentStep.title}</p>
                <p className="text-sm text-slate-700">{currentStep.instruction}</p>

                {currentStep.confirm.needed && (
                  <div className="rounded bg-sky-50 border border-sky-200 p-2 space-y-2">
                    <p className="text-sm text-sky-900">{currentStep.confirm.question || "이 단계가 맞나요?"}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm"
                        onClick={() => void logConfirm("yes")}
                      >
                        예
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded border border-sky-300 bg-white text-sky-900 text-sm"
                        onClick={() => setShowScreenshotCandidates((prev) => !prev)}
                      >
                        아니오, 후보 선택
                      </button>
                    </div>
                    {showScreenshotCandidates && (
                      <div className="flex gap-2 flex-wrap">
                        {currentStep.candidates.map((candidate, index) => (
                          <button
                            key={`${candidate.label}-${index}`}
                            type="button"
                            className="px-3 py-1.5 rounded border border-sky-300 bg-white text-sky-900 text-sm"
                            onClick={() => void logConfirm("no", index)}
                          >
                            {candidate.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
                >
                  {loading ? "생성 중..." : "다음"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {activeMode === "dom" && stepPlan && (
        <WorkGuideOverlay
          stepPlan={stepPlan}
          busy={loading}
          onClose={() => setStepPlan(null)}
          onNext={() => void handleNext()}
          onConfirm={(answer, selectedCandidateIndex) => {
            void logConfirm(answer, selectedCandidateIndex);
          }}
        />
      )}
    </div>
  );
};

export default WorkGuideDemoPage;
