import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExecutionRecoveryTimer } from "../components/eft/ExecutionRecoveryTimer";
import { SlideIntake } from "../components/eft/SlideIntake";
import type { StrictIntakeInput } from "../types/serverAI";
import {
  buildExecutionRecoveryPlan,
  type ExecutionRecoveryPlan,
} from "../utils/executionRecovery";

type QuickRescueInput = {
  emotion: string;
  situation: string;
};

type FlowPhase = "intake" | "response" | "timer" | "success";

const EMOTION_CHIPS = [
  "anxious",
  "blocked",
  "tired",
  "avoidant",
  "overwhelmed",
  "frustrated",
  "distracted",
];

const parseText = (raw: string | null, fallback = ""): string => {
  if (raw == null) return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const parseBoolean = (raw: string | null): boolean => {
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const openExternal = (href?: string) => {
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
};

export const EFTStrictPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [quickInput, setQuickInput] = useState<QuickRescueInput>({
    emotion: parseText(searchParams.get("emotion") || searchParams.get("core_emotion"), "anxious"),
    situation: parseText(
      searchParams.get("situation") ||
        searchParams.get("situation_context") ||
        searchParams.get("sentence") ||
        searchParams.get("entry_sentence"),
      "",
    ),
  });
  const [showDeepHelp, setShowDeepHelp] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [phase, setPhase] = useState<FlowPhase>("intake");
  const [recoveryPlan, setRecoveryPlan] = useState<ExecutionRecoveryPlan | null>(null);
  const [activePrompt, setActivePrompt] = useState<QuickRescueInput | null>(null);

  const entrySentence = parseText(
    searchParams.get("sentence") || searchParams.get("entry_sentence"),
    "",
  );
  const entryPoint = parseText(searchParams.get("entry_point"), "");
  const scheduleId = parseText(searchParams.get("schedule_id"), "");
  const scheduleName = parseText(searchParams.get("schedule_name"), "");
  const distractionType = parseText(searchParams.get("distraction_type"), "");
  const blockedMin = parseText(searchParams.get("blocked_min"), "");
  const recoveryEventId = parseText(searchParams.get("event_id"), "");
  const nativePrompted =
    parseBoolean(searchParams.get("native_prompted")) ||
    parseBoolean(searchParams.get("skip_entry_gate"));

  const [entryGateOpen, setEntryGateOpen] = useState(
    entrySentence.length === 0 || nativePrompted,
  );

  const recoveryContextSummary = useMemo(() => {
    const items: string[] = [];
    if (scheduleName) items.push(scheduleName);
    if (blockedMin) items.push(`${blockedMin} min blocked`);
    if (distractionType) items.push(`${distractionType} distraction`);
    if (entryPoint === "progress_blocked") items.push("progress blocked");
    if (entryPoint === "distraction_detected") items.push("distraction detected");
    if (entryPoint === "schedule_start") items.push("delayed start");
    return items;
  }, [blockedMin, distractionType, entryPoint, scheduleName]);

  useEffect(() => {
    if (!recoveryPlan) return;
    try {
      window.EftRecoveryBridge?.onStrictIntakeComplete?.(
        JSON.stringify({
          event_id: recoveryEventId || undefined,
          entry_point: entryPoint || undefined,
          schedule_id: scheduleId || undefined,
          schedule_name: scheduleName || undefined,
          quick_rescue: true,
        }),
      );
    } catch (error) {
      console.warn("Failed to notify native recovery bridge.", error);
    }
  }, [entryPoint, recoveryEventId, recoveryPlan, scheduleId, scheduleName]);

  const submitQuickRescue = () => {
    if (!quickInput.emotion.trim() || !quickInput.situation.trim()) {
      setQuickError("Enter both your emotion and what you are stuck on.");
      return;
    }
    const prompt = {
      emotion: quickInput.emotion.trim(),
      situation: quickInput.situation.trim(),
    };
    setQuickError("");
    setActivePrompt(prompt);
    setRecoveryPlan(buildExecutionRecoveryPlan(prompt));
    setPhase("response");
  };

  const submitDeepHelp = (data: StrictIntakeInput) => {
    const prompt = {
      emotion: data.core_emotion,
      situation: data.situation_context,
    };
    setActivePrompt(prompt);
    setRecoveryPlan(buildExecutionRecoveryPlan(prompt));
    setPhase("response");
    setShowDeepHelp(false);
  };

  const startTimer = () => {
    if (!recoveryPlan) return;
    setPhase("timer");
  };

  const continueWithNextMove = () => {
    if (!recoveryPlan) return;
    setRecoveryPlan({
      ...recoveryPlan,
      microAction: {
        ...recoveryPlan.microAction,
        instruction: recoveryPlan.microAction.nextInstruction,
        fallbackInstruction: recoveryPlan.microAction.instruction,
      },
    });
    setPhase("timer");
  };

  const renderQuickRescue = () => (
    <div className="w-full max-w-xl rounded-[28px] border border-orange-100 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-orange-700">
        Quick Rescue
      </div>
      <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-900">
        Restart action before your brain negotiates again.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Name the feeling. Name the stuck point. The app will shrink the next move for you.
      </p>

      <div className="mt-6">
        <label className="text-sm font-semibold text-slate-800">What are you feeling right now?</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {EMOTION_CHIPS.map((emotion) => {
            const selected = quickInput.emotion.toLowerCase() === emotion;
            return (
              <button
                key={emotion}
                type="button"
                onClick={() => setQuickInput((current) => ({ ...current, emotion }))}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selected
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-orange-300 hover:text-slate-900"
                }`}
              >
                {emotion}
              </button>
            );
          })}
        </div>
        <input
          value={quickInput.emotion}
          onChange={(event) =>
            setQuickInput((current) => ({ ...current, emotion: event.target.value }))
          }
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white"
          placeholder="anxious"
        />
      </div>

      <div className="mt-5">
        <label className="text-sm font-semibold text-slate-800">What are you stuck on right now?</label>
        <textarea
          value={quickInput.situation}
          onChange={(event) =>
            setQuickInput((current) => ({ ...current, situation: event.target.value }))
          }
          className="mt-3 min-h-32 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-6 text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white"
          placeholder="I am stuck implementing Google login"
        />
      </div>

      {quickError ? (
        <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {quickError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submitQuickRescue}
        className="mt-6 w-full rounded-2xl bg-orange-500 px-4 py-4 text-base font-semibold text-white transition hover:bg-orange-400"
      >
        Start recovery
      </button>

      <button
        type="button"
        onClick={() => setShowDeepHelp((current) => !current)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
      >
        {showDeepHelp ? "Back to quick rescue" : "Need deeper help?"}
      </button>

      {showDeepHelp ? (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            Deep Intake
          </p>
          <SlideIntake onComplete={submitDeepHelp} />
        </div>
      ) : null}
    </div>
  );

  const renderResponseScreen = () => {
    if (!recoveryPlan) return null;

    return (
      <div className="w-full max-w-3xl rounded-[32px] border border-slate-200 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-700">
            AI Recovery
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600">
            {recoveryPlan.emotionLabel} · {recoveryPlan.frictionLabel}
          </div>
        </div>

        <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-900">
          {recoveryPlan.resetMessage}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{recoveryPlan.resetDetail}</p>

        {activePrompt ? (
          <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50/70 p-4 text-sm leading-6 text-slate-700">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-700">
              Your stuck moment
            </div>
            <div className="mt-2">
              <span className="font-semibold text-slate-900">{activePrompt.emotion}</span>
              <span className="mx-2 text-slate-400">/</span>
              <span>{activePrompt.situation}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">EFT</div>
            <h3 className="mt-3 text-xl font-bold text-slate-900">
              {recoveryPlan.eftRecommendation.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {recoveryPlan.eftRecommendation.subtitle}
            </p>
            <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
              {recoveryPlan.eftRecommendation.tappingPoints.join(" -> ")}
            </div>
            <div className="mt-4 text-sm font-semibold text-orange-700">
              {recoveryPlan.eftRecommendation.actionLabel} · {recoveryPlan.eftRecommendation.durationLabel}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Meditation
            </div>
            <h3 className="mt-3 text-xl font-bold text-slate-900">
              {recoveryPlan.meditationRecommendation.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {recoveryPlan.meditationRecommendation.subtitle}
            </p>
            <button
              type="button"
              onClick={() => openExternal(recoveryPlan.meditationRecommendation.href)}
              className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-slate-900"
            >
              {recoveryPlan.meditationRecommendation.actionLabel} ·{" "}
              {recoveryPlan.meditationRecommendation.durationLabel}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Battle Mode
            </div>
            <h3 className="mt-3 text-xl font-bold text-slate-900">
              {recoveryPlan.battleModeRecommendation.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {recoveryPlan.battleModeRecommendation.subtitle}
            </p>
            <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-orange-200">
              {recoveryPlan.battleModeRecommendation.trackLabel}
            </div>
            <button
              type="button"
              onClick={() => openExternal(recoveryPlan.battleModeRecommendation.href)}
              className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-slate-900"
            >
              {recoveryPlan.battleModeRecommendation.actionLabel} ·{" "}
              {recoveryPlan.battleModeRecommendation.durationLabel}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-orange-200 bg-slate-950 p-6 text-white">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200">
            First move
          </div>
          <p className="mt-4 text-2xl font-bold">{recoveryPlan.microAction.instruction}</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">{recoveryPlan.microAction.doneWhen}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={startTimer}
            className="flex-1 rounded-2xl bg-orange-500 px-4 py-4 text-base font-semibold text-white transition hover:bg-orange-400"
          >
            Start 2-minute recovery
          </button>
          <button
            type="button"
            onClick={() => setPhase("intake")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            Change input
          </button>
        </div>
      </div>
    );
  };

  const renderSuccessScreen = () => {
    if (!recoveryPlan) return null;
    return (
      <div className="w-full max-w-xl rounded-[32px] border border-emerald-100 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
          Momentum Restored
        </div>
        <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-900">
          You restarted action with one visible move.
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Keep the chain alive while the task feels lighter than it did two minutes ago.
        </p>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Next tiny move
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {recoveryPlan.microAction.nextInstruction}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={continueWithNextMove}
            className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-base font-semibold text-white transition hover:bg-slate-800"
          >
            Give me the next tiny move
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("intake");
              setRecoveryPlan(null);
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            Back to quick rescue
          </button>
        </div>
      </div>
    );
  };

  if (!entryGateOpen) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(180deg,#fff7ed_0%,#f8fafc_52%,#e2e8f0_100%)] p-4">
        <div className="w-full max-w-xl rounded-[32px] border border-orange-100 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-orange-700">
            Recovery Prompt
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-900">
            You look stuck. Start the recovery loop.
          </h1>
          {entrySentence ? (
            <p className="mt-4 rounded-3xl border border-orange-100 bg-orange-50/70 p-4 text-base leading-7 text-slate-700">
              {entrySentence}
            </p>
          ) : null}
          {recoveryContextSummary.length > 0 ? (
            <p className="mt-4 text-sm text-slate-500">{recoveryContextSummary.join(" · ")}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setEntryGateOpen(true)}
            className="mt-6 w-full rounded-2xl bg-orange-500 px-4 py-4 text-base font-semibold text-white transition hover:bg-orange-400"
          >
            Start recovery
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-start justify-center bg-[linear-gradient(180deg,#fff7ed_0%,#f8fafc_52%,#e2e8f0_100%)] px-4 py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.16),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(30,41,59,0.08),_transparent_28%)]" />
      <div className="relative flex w-full max-w-4xl flex-col gap-4">
        {(entrySentence || recoveryContextSummary.length > 0) && phase === "intake" ? (
          <div className="w-full rounded-[28px] border border-orange-100 bg-white/85 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-700">
              Recovery Context
            </div>
            {entrySentence ? (
              <p className="mt-2 text-base leading-7 text-slate-700">{entrySentence}</p>
            ) : null}
            {recoveryContextSummary.length > 0 ? (
              <p className="mt-3 text-sm text-slate-500">{recoveryContextSummary.join(" · ")}</p>
            ) : null}
          </div>
        ) : null}

        {phase === "intake" && renderQuickRescue()}
        {phase === "response" && renderResponseScreen()}
        {phase === "success" && renderSuccessScreen()}
      </div>

      {phase === "timer" && recoveryPlan ? (
        <ExecutionRecoveryTimer
          instruction={recoveryPlan.microAction.instruction}
          fallbackInstruction={recoveryPlan.microAction.fallbackInstruction}
          doneWhen={recoveryPlan.microAction.doneWhen}
          battleModeLabel={recoveryPlan.battleModeRecommendation.trackLabel}
          onDone={() => setPhase("success")}
        />
      ) : null}
    </div>
  );
};
