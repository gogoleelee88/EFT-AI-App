import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const t = (v: string | null) => (v ?? "").trim();

export default function RecoveryChoicePage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const entryPoint = t(sp.get("entry_point"));
  const sessionState = t(sp.get("session_state"));
  const scheduleId = t(sp.get("schedule_id"));
  const scheduleName = t(sp.get("schedule_name"));
  const sentence = t(sp.get("sentence") || sp.get("entry_sentence"));
  const blockedMin = t(sp.get("blocked_min"));
  const distractionType = t(sp.get("distraction_type"));

  const header = scheduleName
    ? `지금은 "${scheduleName}"에서 ${entryPoint ? `[${entryPoint}]` : ""} 상태예요`
    : `지금은 ${entryPoint ? `[${entryPoint}]` : "미룸/막힘/딴짓"} 상태예요`;

  const qs = () => {
    const q = new URLSearchParams();
    if (entryPoint) q.set("entry_point", entryPoint);
    if (sessionState) q.set("session_state", sessionState);
    if (scheduleId) q.set("schedule_id", scheduleId);
    if (scheduleName) q.set("schedule_name", scheduleName);
    if (sentence) q.set("sentence", sentence);
    if (blockedMin) q.set("blocked_min", blockedMin);
    if (distractionType) q.set("distraction_type", distractionType);
    return q.toString();
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-lg font-bold text-gray-900">어떻게 풀어볼까?</h1>
        <p className="mt-2 text-sm text-gray-600">{header}</p>

        {sentence ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {sentence}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate(`/eft-strict?${qs()}`)}
            className="w-full rounded-xl bg-amber-500 py-3 text-center font-medium text-white transition hover:bg-amber-600"
          >
            직접 적고 바로 EFT
          </button>
          <button
            type="button"
            onClick={() => navigate(`/openchat?${qs()}`)}
            className="w-full rounded-xl border-2 border-indigo-200 bg-indigo-50 py-3 text-center font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            AI랑 대화로 정리
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          * 선택 화면은 강제하지 않아요. 원하는 방식으로 진행하세요.
        </p>
      </div>
    </div>
  );
}
