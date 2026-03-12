import React, { useEffect, useState } from "react";

type ExecutionRecoveryTimerProps = {
  instruction: string;
  fallbackInstruction: string;
  doneWhen: string;
  battleModeLabel: string;
  onDone: () => void;
};

const COUNTDOWN_SECONDS = 5;
const EXECUTION_SECONDS = 120;

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${mins}:${remainder.toString().padStart(2, "0")}`;
};

export const ExecutionRecoveryTimer: React.FC<ExecutionRecoveryTimerProps> = ({
  instruction,
  fallbackInstruction,
  doneWhen,
  battleModeLabel,
  onDone,
}) => {
  const [countdownRemaining, setCountdownRemaining] = useState(COUNTDOWN_SECONDS);
  const [timeRemaining, setTimeRemaining] = useState(EXECUTION_SECONDS);
  const [activeInstruction, setActiveInstruction] = useState(instruction);
  const [activeDoneWhen, setActiveDoneWhen] = useState(doneWhen);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setCountdownRemaining(COUNTDOWN_SECONDS);
    setTimeRemaining(EXECUTION_SECONDS);
    setActiveInstruction(instruction);
    setActiveDoneWhen(doneWhen);
    setUsedFallback(false);
  }, [doneWhen, instruction]);

  useEffect(() => {
    if (countdownRemaining <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setCountdownRemaining((current) => current - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdownRemaining]);

  useEffect(() => {
    if (countdownRemaining > 0 || timeRemaining <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setTimeRemaining((current) => current - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdownRemaining, timeRemaining]);

  useEffect(() => {
    if (countdownRemaining > 0 || timeRemaining > 0 || usedFallback) return;
    setActiveInstruction(fallbackInstruction);
    setActiveDoneWhen("Done when the smaller move is visible on screen.");
    setUsedFallback(true);
    setTimeRemaining(EXECUTION_SECONDS);
  }, [countdownRemaining, fallbackInstruction, timeRemaining, usedFallback]);

  if (countdownRemaining > 0) {
    return (
      <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <div className="rounded-full border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-200">
            Battle Mode Ready
          </div>
          <p className="mt-6 text-sm uppercase tracking-[0.35em] text-slate-400">Music on. Thinking off.</p>
          <div className="mt-6 text-[96px] font-black leading-none text-orange-300 sm:text-[120px]">
            {countdownRemaining}
          </div>
          <p className="mt-6 text-lg font-semibold text-slate-100">One move only.</p>
          <p className="mt-2 text-sm text-slate-400">{battleModeLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.18),_transparent_38%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.18),_transparent_32%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-between px-6 py-8">
        <div>
          <div className="flex items-center justify-between">
            <div className="rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-300">
              Execution Recovery
            </div>
            <div className="text-sm font-semibold text-orange-200">{battleModeLabel}</div>
          </div>
          <div className="mt-10 flex items-center justify-center">
            <div className="flex h-48 w-48 items-center justify-center rounded-full border border-orange-400/40 bg-slate-900/80 shadow-[0_0_80px_rgba(249,115,22,0.15)]">
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.35em] text-slate-500">Timer</div>
                <div className="mt-3 text-6xl font-black text-orange-200">{formatTime(timeRemaining)}</div>
              </div>
            </div>
          </div>
          <div className="mt-10 rounded-3xl border border-slate-800 bg-slate-900/85 p-6 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
              For 2 minutes, do only this one move.
            </p>
            <p className="mt-4 text-3xl font-bold leading-tight text-white">{activeInstruction}</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">{activeDoneWhen}</p>
          </div>
        </div>

        <div className="space-y-3 pb-2">
          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-2xl bg-orange-500 px-4 py-4 text-base font-semibold text-white transition hover:bg-orange-400"
          >
            I did it
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveInstruction(fallbackInstruction);
              setActiveDoneWhen("Done when the smaller move is visible on screen.");
              setUsedFallback(true);
            }}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-4 text-base font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Still stuck
          </button>
        </div>
      </div>
    </div>
  );
};
