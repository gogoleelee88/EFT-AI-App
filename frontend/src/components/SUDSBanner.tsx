import React from "react";

type AskSudsPayload = {
  ui?: "banner" | "inline";
  title?: string;
  message?: string;
  ctaLabel?: string;
  scale_min?: number;
  scale_max?: number;
};

export function SUDSBanner({ payload, onSubmit }: { payload: AskSudsPayload; onSubmit: (score: number) => void }) {
  const min = payload.scale_min ?? 0;
  const max = payload.scale_max ?? 10;
  const [score, setScore] = React.useState<number>((min + max) >> 1);
  return (
    <div className="w-full rounded-2xl shadow p-4 border bg-white">
      <div className="font-semibold text-lg">{payload.title ?? "SUDS 측정"}</div>
      <div className="text-sm opacity-80 mt-1">{payload.message ?? "0(전혀 아님) ~ 10(아주 심함)"}</div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={score}
          onChange={(e) => setScore(parseInt(e.target.value))}
          className="w-full"
        />
        <div className="w-10 text-center font-mono">{score}</div>
      </div>
      <button onClick={() => onSubmit(score)} className="mt-3 px-3 py-2 rounded-xl bg-black text-white">
        {payload.ctaLabel ?? "제출"}
      </button>
    </div>
  );
}
