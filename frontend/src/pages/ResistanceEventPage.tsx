import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SpecCard } from "../components/spec";
import { Button } from "../components/ui/Button";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";

/** 백엔드 TriggerEnum 7종 — API에는 영문, UI에는 한글 라벨 */
const TRIGGERS: { value: string; label: string }[] = [
  { value: "START_AVERSION", label: "시작이 싫다" },
  { value: "OVERWHELM", label: "압도적이다" },
  { value: "PERFECTIONISM", label: "완벽주의" },
  { value: "PAIN", label: "통증" },
  { value: "FATIGUE", label: "피로" },
  { value: "CONFLICT", label: "갈등" },
  { value: "UNKNOWN", label: "기타" },
];

type LocationState = { dayId?: number };

const ResistanceEventPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const [dayIdInput, setDayIdInput] = useState<string>(
    state.dayId != null ? String(state.dayId) : ""
  );
  const [trigger, setTrigger] = useState<string>("");
  const [intensity, setIntensity] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [serverResponse, setServerResponse] = useState<{
    lock_applied: number;
    adapt_required: boolean;
    action?: {
      technique: string;
      duration_sec: number;
      micro_step?: string | null;
    };
  } | null>(null);
  const [lockRemaining, setLockRemaining] = useState<number | null>(null);
  const [planDate, setPlanDate] = useState<string | null>(null);
  const {
    isConnected: googleConnected,
    googleEvents,
    lastSync,
    loading: googleLoading,
    error: googleError,
    connectGoogle,
    fetchGoogleEvents,
  } = useGoogleCalendar();

  useEffect(() => {
    if (!serverResponse) return;
    const total = serverResponse.lock_applied ?? 120;
    setLockRemaining(total);
    const interval = window.setInterval(() => {
      setLockRemaining((prev) => {
        if (prev == null || prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [serverResponse]);

  // day_id 변경 시 DayPlan 날짜 조회 후 Google 일정 동기화
  useEffect(() => {
    const numericDayId = Number(dayIdInput || state.dayId);
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setPlanDate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/spec/plan/day/${numericDayId}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.date) {
          setPlanDate(data.date);
          if (googleConnected) {
            await fetchGoogleEvents(data.date);
          }
        }
      } catch {
        // 조용히 실패
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayIdInput, state.dayId, googleConnected, fetchGoogleEvents]);

  const handleSubmit = async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setError("DayPlan ID(day_id)를 입력하거나, 일정/체크인 화면에서 이 페이지로 이동해 주세요.");
      return;
    }
    if (!trigger) {
      setError("저항 트리거를 하나 선택해 주세요.");
      return;
    }

    setError(null);
    setLoading(true);
    setSuccess(false);

    try {
      const res = await fetch("/api/spec/resistance/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_id: numericDayId,
          trigger,
          intensity,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `status ${res.status}`);
      }
      setSuccess(true);
      const data = await res.json();
      setServerResponse({
        lock_applied: data.lock_applied,
        adapt_required: data.adapt_required,
        action: data.action,
      });
      console.log("resistance/event 응답:", data);
    } catch (e) {
      console.error("resistance/event 오류:", e);
      setError(
        e instanceof Error ? e.message : "저항 이벤트 전송에 실패했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex flex-col">
      <div className="flex-1 px-4 py-4 flex justify-center">
        <div className="w-full max-w-2xl space-y-4 pb-24">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">
              저항 이벤트 기록
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/recover?entry_point=progress_blocked")}
              >
                막힘가이드
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/dashboard")}
              >
                대시보드
              </Button>
            </div>
          </div>

          <SpecCard glass className="p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  DayPlan ID (day_id)
                </label>
                <input
                  type="number"
                  min={1}
                  value={dayIdInput}
                  onChange={(e) => setDayIdInput(e.target.value)}
                  placeholder={state.dayId != null ? String(state.dayId) : "예: 1"}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-spec-100"
                  aria-label="DayPlan ID"
                />
                <p className="text-xs text-gray-500 mt-1">
                  체크인 또는 일정 입력 후 이 페이지로 오면 자동으로 채워질 수 있습니다.
                </p>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  지금 어떤 느낌인가요? (트리거 선택)
                </span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="저항 트리거 선택">
                  {TRIGGERS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTrigger(t.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border-2 transform ${
                        trigger === t.value
                          ? "border-spec-100 bg-spec-100/20 text-spec-100 scale-105 shadow-md"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  강도 (0 = 괜찮음 → 10 = 매우 힘듦)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">0</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-gray-200 accent-spec-100"
                    aria-label="강도"
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={intensity}
                  />
                  <span className="text-xs text-gray-500">10</span>
                </div>
                <p className="text-sm font-semibold text-spec-100 mt-1">
                  {intensity}
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              {success && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  기록되었습니다. 아래 타이머가 0이 될 때까지 잠시 숨을 고르며 버텨볼까요?
                </div>
              )}

              {/* Google 캘린더 컨텍스트 (Resistance용) */}
              <div className="mt-2 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">
                      📅 해당 DayPlan의 Google 일정
                    </span>
                    {planDate && (
                      <span className="text-[11px] text-gray-500">
                        ({planDate})
                      </span>
                    )}
                  </div>
                  {!googleConnected ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={connectGoogle}
                    >
                      Google 연동
                    </Button>
                  ) : lastSync ? (
                    <span className="text-[11px] text-gray-500">
                      마지막 동기화:{" "}
                      {lastSync.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                </div>
                {googleError && (
                  <div className="text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                    {googleError}
                  </div>
                )}
                <div className="space-y-1 max-h-24 overflow-auto rounded-md bg-white/70 border border-gray-100 px-3 py-2">
                  {googleLoading && (
                    <div className="text-gray-500">Google 일정을 불러오는 중…</div>
                  )}
                  {!googleLoading && googleEvents.length === 0 && (
                    <div className="text-gray-400">
                      {googleConnected
                        ? "해당 날짜에 등록된 Google 일정이 없습니다."
                        : "연동 후 이곳에서 Google 일정을 함께 볼 수 있습니다."}
                    </div>
                  )}
                  {googleEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-2 text-gray-700"
                    >
                      <span className="text-gray-400">▸</span>
                      <span className="truncate">
                        {ev.start} ~ {ev.end} · {ev.displayTitle ?? ev.title}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">
                  저항이 올라온 시점에, 원래 Google 캘린더에는 어떤 일정이 있었는지
                  함께 보면서 패턴을 파악해볼 수 있습니다.
                </p>
              </div>

              {serverResponse && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-16">
                      {(() => {
                        const total = serverResponse.lock_applied ?? 120;
                        const remaining = lockRemaining ?? total;
                        const clamped = Math.max(0, Math.min(total, remaining));
                        const progress = total > 0 ? clamped / total : 0;
                        const radius = 26;
                        const circumference = 2 * Math.PI * radius;
                        const offset = circumference * (1 - progress);
                        return (
                          <svg
                            viewBox="0 0 64 64"
                            className="w-16 h-16 text-spec-100"
                            aria-label="집중 타이머"
                          >
                            <circle
                              cx="32"
                              cy="32"
                              r={radius}
                              className="stroke-gray-200"
                              strokeWidth="6"
                              fill="none"
                            />
                            <circle
                              cx="32"
                              cy="32"
                              r={radius}
                              className="stroke-current"
                              strokeWidth="6"
                              fill="none"
                              strokeDasharray={circumference}
                              strokeDashoffset={offset}
                              strokeLinecap="round"
                            />
                            <text
                              x="50%"
                              y="52%"
                              textAnchor="middle"
                              className="fill-gray-800 text-xs font-semibold"
                            >
                              {clamped}s
                            </text>
                          </svg>
                        );
                      })()}
                    </div>
                    <div>
                      <div className="font-semibold">집중 타이머</div>
                      <div className="text-xs text-gray-600">
                        lock_applied: {serverResponse.lock_applied ?? 120}초
                      </div>
                      <div className="text-xs text-gray-600">
                        이 시간 동안 다른 작업으로 도망가기보다는, 방금 선택한 저항을
                        지켜보며 버텨보는 연습을 해요.
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {serverResponse.action && (
                      <div className="text-xs text-gray-700">
                        <div className="font-semibold mb-1">권장 대처 방법</div>
                        <div>
                          기법: <span className="font-medium">{serverResponse.action.technique}</span>
                        </div>
                        <div>소요 시간: {serverResponse.action.duration_sec}초</div>
                        {serverResponse.action.micro_step && (
                          <div className="mt-1">
                            micro_step: {serverResponse.action.micro_step}
                          </div>
                        )}
                      </div>
                    )}
                    {serverResponse.adapt_required && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        저항이 반복되고 있어요. 이 세션 이후에{" "}
                        <button
                          type="button"
                          onClick={() =>
                            navigate("/checkin", {
                              state: { dayId: Number(dayIdInput || state.dayId) || undefined },
                            })
                          }
                          className="underline font-semibold"
                        >
                          계획 재조정
                        </button>
                        을 한 번 더 해보는 것을 추천합니다.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "전송 중..." : "저항 이벤트 기록하기"}
              </Button>
            </div>
          </SpecCard>
        </div>
      </div>
    </div>
  );
};

export default ResistanceEventPage;
