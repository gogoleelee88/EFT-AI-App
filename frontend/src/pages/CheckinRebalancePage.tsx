import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SpecCard, ModeBadge, TodayConditionBanner, type SpecMode } from "../components/spec";
import { Button } from "../components/ui/Button";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { useAuth } from "../hooks/useAuth";
import { listMeals, type MealListItem } from "../services/mealCoachService";

type SleepHours = "LT5" | "H5_6" | "H6_7" | "H7_8" | "GT8";
type Mood = "calm" | "ok" | "anxious" | "low" | "irritated";
type PeriodStatus = "on" | "pre" | "post" | "none" | "";

type PlanItem = {
  item_id?: string;
  task_id?: number;
  planned_block_minutes?: number;
  micro_steps?: string[];
  title?: string;
  [key: string]: any;
};

type DayPlanLike = {
  day_id?: number;
  date?: string;
  mode?: number;
  items?: PlanItem[];
  protected_block_minutes?: number | null;
  [key: string]: any;
};

type LocationState = {
  dayId?: number;
  originalPlan?: DayPlanLike;
};

type DiffResult = {
  shrunk: { before: PlanItem; after: PlanItem }[];
  droppedOrDelayed: PlanItem[];
  protectedBefore?: number | null;
  protectedAfter?: number | null;
};

type ConfidenceLevel = "low" | "med" | "high";

type DriverSummary = {
  driver: string;
  score: number;
  confidence: ConfidenceLevel;
  evidence?: string[];
};

type DailySummary = {
  drivers?: DriverSummary[];
  drivers_top2: DriverSummary[];
  confidence: ConfidenceLevel;
  evidence_snapshot: string[];
  menstrual_score_0_100: number;
  data_quality: string;
};

type PatchSuggestion = {
  patch_type: "BUFFER_BLOCK" | "SPLIT_DEEP_WORK" | "DECISION_DELAY";
  reason: string;
  allowed: boolean;
  blocked_reason?: string | null;
  preview?: Record<string, unknown>;
};

function buildItemKey(item: PlanItem, index: number): string {
  if (item.item_id) return `item:${item.item_id}`;
  if (item.task_id != null) return `task:${item.task_id}`;
  const title = (item.title ?? "").toString();
  const block = item.planned_block_minutes ?? "";
  return `hash:${title}-${block}-${index}`;
}

function computeDiff(before?: DayPlanLike | null, after?: DayPlanLike | null): DiffResult {
  const beforeItems = before?.items || [];
  const afterItems = after?.items || [];

  const beforeMap = new Map<string, { item: PlanItem; index: number }>();
  const afterMap = new Map<string, { item: PlanItem; index: number }>();

  beforeItems.forEach((item, idx) => {
    beforeMap.set(buildItemKey(item, idx), { item, index: idx });
  });
  afterItems.forEach((item, idx) => {
    afterMap.set(buildItemKey(item, idx), { item, index: idx });
  });

  const allKeys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  const shrunk: { before: PlanItem; after: PlanItem }[] = [];
  const droppedOrDelayed: PlanItem[] = [];

  for (const key of allKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (b && a) {
      const beforeBlock = b.item.planned_block_minutes ?? 0;
      const afterBlock = a.item.planned_block_minutes ?? 0;
      if (afterBlock > 0 && afterBlock < beforeBlock) {
        shrunk.push({ before: b.item, after: a.item });
      }
    } else if (b && !a) {
      droppedOrDelayed.push(b.item);
    }
  }

  return {
    shrunk,
    droppedOrDelayed,
    protectedBefore: before?.protected_block_minutes ?? null,
    protectedAfter: after?.protected_block_minutes ?? null,
  };
}

function clamp04(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(4, Math.round(n)));
}

const CheckinRebalancePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const { user } = useAuth();

  const [dayIdInput, setDayIdInput] = useState<string>(
    state.dayId != null ? String(state.dayId) : ""
  );
  const [sleepHours, setSleepHours] = useState<SleepHours>("H6_7");
  const [fatigue, setFatigue] = useState<number>(5);
  const [pain, setPain] = useState<number>(2);
  const [mood, setMood] = useState<Mood>("ok");
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>("");
  const [menstrualBleedingLevel, setMenstrualBleedingLevel] = useState<string>("");
  const [menstrualCramps, setMenstrualCramps] = useState<number>(1);
  const [menstrualFatigue, setMenstrualFatigue] = useState<number>(1);
  const [menstrualIrritability, setMenstrualIrritability] = useState<number>(1);
  const [menstrualFocusDrop, setMenstrualFocusDrop] = useState<string>("");
  const [menstrualNotes, setMenstrualNotes] = useState<string>("");
  const [periodStartDate, setPeriodStartDate] = useState<string>("");
  const [mealOptions, setMealOptions] = useState<MealListItem[]>([]);
  const [selectedMealId, setSelectedMealId] = useState<string>("");
  const [linkMealSignal, setLinkMealSignal] = useState<boolean>(true);
  const [mealLoadError, setMealLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{
    condition_id?: number;
    final_mode: number;
    adapt_applied: boolean;
    updated_day_plan?: DayPlanLike | null;
    daily_summary?: DailySummary | null;
    medical_attention_notice?: string | null;
    google_calendar_synced?: boolean;
    google_calendar_sync_message?: string | null;
  } | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [patchResultMessage, setPatchResultMessage] = useState<string | null>(null);
  const [recommendedPatch, setRecommendedPatch] = useState<PatchSuggestion | null>(null);
  const [cycleConfidence, setCycleConfidence] = useState<ConfidenceLevel | null>(null);
  const [showModeDownToast, setShowModeDownToast] = useState(false);
  const [adaptLoading, setAdaptLoading] = useState(false);
  const [adaptError, setAdaptError] = useState<string | null>(null);
  const [adaptResult, setAdaptResult] = useState<{
    day_id: number;
    actions_applied: string[];
    updated_plan: DayPlanLike | null;
    soothe_requested: boolean;
    delay_scheduler_hint?: number[] | null;
    google_calendar_synced?: boolean;
    google_calendar_sync_message?: string | null;
  } | null>(null);

  /* S8: simulation + job polling */
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<"pending" | "completed" | "failed" | null>(null);
  const [jobResult, setJobResult] = useState<unknown>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const {
    isConnected: googleConnected,
    googleEvents,
    lastSync,
    loading: googleLoading,
    error: googleError,
    connectGoogle,
    fetchGoogleEvents,
  } = useGoogleCalendar();

  const originalPlan = state.originalPlan || null;

  const updatedPlan: DayPlanLike | null = response?.updated_day_plan || null;

  const diff = useMemo(
    () => computeDiff(originalPlan, updatedPlan || originalPlan),
    [originalPlan, updatedPlan]
  );

  const targetPlan: DayPlanLike | null = updatedPlan || originalPlan;

  const firstTask = targetPlan?.items && targetPlan.items.length > 0 ? targetPlan.items[0] : null;
  const isFirstTwoMinuteStep = (step?: string) =>
    typeof step === "string" &&
    (step.includes("첫 2분 시작") || step.includes("First 2-minute start"));
  const firstMicroStepRaw =
    (firstTask?.micro_steps && firstTask.micro_steps[0]) || "첫 2분 시작(생성 필요)";
  const hasFirstTwoMin =
    firstTask?.micro_steps?.some((s) => isFirstTwoMinuteStep(s)) ?? false;
  const ctaLabel = hasFirstTwoMin
    ? firstMicroStepRaw
    : `2분 시작(생성 필요): ${firstMicroStepRaw}`;

  const finalMode = response?.final_mode ?? targetPlan?.mode ?? 100;
  const specMode: SpecMode =
    finalMode === 70 || finalMode === 40 ? finalMode : 100;
  const targetDate = targetPlan?.date;
  const dailySummary = response?.daily_summary ?? null;
  const medicalAttentionNotice = response?.medical_attention_notice ?? null;

  const fetchPatchSuggestion = useCallback(async (date: string, dayId?: number) => {
    try {
      const params = new URLSearchParams({ date });
      if (dayId) params.set("day_id", String(dayId));
      if (user?.uid) params.set("user_id", user.uid);
      const res = await fetch(`/api/spec/plan/patch/suggest?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setRecommendedPatch(null);
        return;
      }
      const data = await res.json();
      setCycleConfidence(data.confidence ?? null);
      const suggestion = Array.isArray(data.suggestions) && data.suggestions.length > 0
        ? (data.suggestions[0] as PatchSuggestion)
        : null;
      setRecommendedPatch(suggestion);
    } catch {
      setRecommendedPatch(null);
    }
  }, [user?.uid]);

  const applyRecommendedPatch = useCallback(async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    const dateForPatch = targetDate || new Date().toISOString().slice(0, 10);
    if (!recommendedPatch) {
      setPatchError("적용 가능한 패치가 없습니다.");
      return;
    }
    setPatchError(null);
    setPatchResultMessage(null);
    setPatchLoading(true);
    try {
      const res = await fetch("/api/spec/plan/patch/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateForPatch,
          patch_type: recommendedPatch.patch_type,
          day_id: Number.isNaN(numericDayId) ? null : numericDayId,
          user_id: user?.uid ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || `status ${res.status}`);
      }
      setPatchResultMessage(data.message || "패치를 적용했습니다.");
      if (data.updated_plan) {
        setResponse((prev) =>
          prev
            ? {
                ...prev,
                updated_day_plan: data.updated_plan,
              }
            : prev
        );
      }
      if (googleConnected) {
        await fetchGoogleEvents(dateForPatch);
      }
      await fetchPatchSuggestion(dateForPatch, Number.isNaN(numericDayId) ? undefined : numericDayId);
    } catch (e) {
      setPatchError(e instanceof Error ? e.message : "패치 적용에 실패했습니다.");
    } finally {
      setPatchLoading(false);
    }
  }, [
    dayIdInput,
    fetchGoogleEvents,
    fetchPatchSuggestion,
    googleConnected,
    recommendedPatch,
    state.dayId,
    targetDate,
    user?.uid,
  ]);

  useEffect(() => {
    if (!showModeDownToast) return;
    const t = setTimeout(() => setShowModeDownToast(false), 4000);
    return () => clearTimeout(t);
  }, [showModeDownToast]);

  /* S8: job polling (4s interval, paused when hidden) */
  useEffect(() => {
    if (jobId == null || jobStatus !== null) return;

    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/spec/jobs/${jobId}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const status = data.status;
        if (status === "completed") {
          setJobStatus("completed");
          setJobResult(data.result ?? data);
        } else if (status === "failed") {
          setJobStatus("failed");
          setJobError(typeof data.result === "string" ? data.result : data.detail ?? "작업 실패");
        }
      } catch {
        // Retry on next poll tick after transient network errors
      }
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  /* S9: show celebration for 1 second when completed */
  useEffect(() => {
    if (jobStatus !== "completed") return;
    setShowCelebration(true);
    const t = setTimeout(() => setShowCelebration(false), 1200);
    return () => clearTimeout(t);
  }, [jobStatus]);

  // Sync Google events using target DayPlan date after checkin/adapt
  useEffect(() => {
    if (!googleConnected || !targetDate) return;
    fetchGoogleEvents(targetDate);
  }, [googleConnected, targetDate, fetchGoogleEvents]);

  useEffect(() => {
    if (!targetDate) return;
    const numericDayId = Number(dayIdInput || state.dayId);
    fetchPatchSuggestion(targetDate, Number.isNaN(numericDayId) ? undefined : numericDayId);
  }, [dayIdInput, fetchPatchSuggestion, state.dayId, targetDate]);

  useEffect(() => {
    let mounted = true;
    const loadMeals = async () => {
      try {
        const data = await listMeals(user?.uid, { limit: 20, meal_state: "ATE" });
        if (!mounted) return;
        setMealOptions(data.items);
        setMealLoadError(null);
        if (!selectedMealId && data.items.length > 0) {
          setSelectedMealId(data.items[0].meal_id);
        }
      } catch (e) {
        if (!mounted) return;
        const message = e instanceof Error ? e.message : "식사 목록을 불러오지 못했습니다.";
        setMealLoadError(message);
      }
    };
    loadMeals();
    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  const handleSubmit = async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setError("먼저 DayPlan(day_id)을 선택하거나 /plan/day에서 계획을 저장해 주세요.");
      return;
    }

    setError(null);
    setLoading(true);

    const derivedDip04 = clamp04(fatigue / 2.5);
    const derivedFocus04 =
      menstrualFocusDrop === "" ? derivedDip04 : clamp04(Number(menstrualFocusDrop));
    const behaviorInference =
      selectedMealId && linkMealSignal
        ? {
            inferred: true,
            meal_id: selectedMealId,
            post_check_slot: "T30",
            post_meal_dip_0_4: derivedDip04,
            focus_drop_0_4: derivedFocus04,
            sleepiness_0_4: derivedDip04,
            sluggishness_0_4: derivedDip04,
            gi_discomfort_0_4: 0,
            headache_0_4: 0,
            caffeine_used: false,
            source: "checkin_meal_link",
          }
        : null;

    const payload = {
      ts: new Date().toISOString(),
      source_level: 1,
      min_condition_set: {
        sleep_hours: sleepHours,
        fatigue,
        pain,
        mood,
        period_status: periodStatus || null,
      },
      wearable: null,
      behavior_inference: behaviorInference,
      previous_condition_id: null,
      day_id: numericDayId,
      user_id: user?.uid ?? null,
      condition_domain: "MENSTRUAL",
      menstrual_quick_check: {
        bleeding_level_0_2:
          menstrualBleedingLevel === "" ? null : Number(menstrualBleedingLevel),
        cramps_0_4: menstrualCramps,
        fatigue_0_4: menstrualFatigue,
        irritability_0_4: menstrualIrritability,
        focus_drop_0_4:
          menstrualFocusDrop === "" ? null : Number(menstrualFocusDrop),
        notes: menstrualNotes.trim() || null,
      },
      period_start_date: periodStartDate || null,
    };

    try {
      const res = await fetch("/api/spec/condition/checkin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = await res.json();
      setResponse({
        condition_id: data.condition_id,
        final_mode: data.final_mode,
        adapt_applied: data.adapt_applied,
        updated_day_plan: data.updated_day_plan,
        daily_summary: data.daily_summary ?? null,
        medical_attention_notice: data.medical_attention_notice ?? null,
        google_calendar_synced: data.google_calendar_synced,
        google_calendar_sync_message: data.google_calendar_sync_message ?? null,
      });
      setAdaptResult(null);
      setAdaptError(null);
      setPatchError(null);
      setPatchResultMessage(null);
      if (data.final_mode === 70 || data.final_mode === 40) {
        setShowModeDownToast(true);
      }
      const dateForPatch =
        data.updated_day_plan?.date || targetDate || new Date().toISOString().slice(0, 10);
      await fetchPatchSuggestion(dateForPatch, numericDayId);
    } catch (e) {
      console.error("condition/checkin error:", e);
      setError("컨디션 처리 중 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdaptClick = async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    const conditionId = response?.condition_id;
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setAdaptError("day_id가 없습니다. 위에서 DayPlan ID를 입력해 주세요.");
      return;
    }
    if (conditionId == null) {
      setAdaptError("'컨디션 적용'을 먼저 실행해 주세요.");
      return;
    }

    setAdaptError(null);
    setAdaptLoading(true);
    setAdaptResult(null);

    try {
      const res = await fetch("/api/spec/adapt/day", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_id: numericDayId,
          condition_id: conditionId,
          mode: response?.final_mode ?? 100,
          condition_score: null,
          user_id: user?.uid ?? null,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `status ${res.status}`);
      }
      const data = await res.json();
      setAdaptResult({
        day_id: data.day_id,
        actions_applied: data.actions_applied ?? [],
        updated_plan: data.updated_plan ?? null,
        soothe_requested: data.soothe_requested ?? false,
        delay_scheduler_hint: data.delay_scheduler_hint ?? null,
        google_calendar_synced: data.google_calendar_synced,
        google_calendar_sync_message: data.google_calendar_sync_message ?? null,
      });
    } catch (e) {
      console.error("adapt/day error:", e);
      setAdaptError(
        e instanceof Error ? e.message : "수동 조정 요청에 실패했습니다."
      );
    } finally {
      setAdaptLoading(false);
    }
  };

  const handleSimulateClick = async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setJobError("day_id가 없습니다. DayPlan ID를 입력해 주세요.");
      return;
    }
    setJobError(null);
    setJobResult(null);
    setJobStatus(null);
    setSimulateLoading(true);
    try {
      const res = await fetch("/api/spec/simulate/day", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day_id: numericDayId }),
      });
      if (res.status !== 202) {
        const t = await res.text();
        throw new Error(t || `status ${res.status}`);
      }
      const data = await res.json();
      const id = data.job_id;
      if (id == null) throw new Error("job_id가 없습니다.");
      setJobId(id);
    } catch (e) {
      console.error("simulate/day error:", e);
      setJobError(e instanceof Error ? e.message : "시뮬레이션 시작에 실패했습니다.");
    } finally {
      setSimulateLoading(false);
    }
  };

  const MODE_DOWN_TOAST_MESSAGE =
    "수면/피로/통증 신호를 반영해 시작 성공률을 우선했습니다.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex flex-col">
      {/* S4: mode-down toast (final_mode 70/40) */}
      {showModeDownToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in-up"
        >
          {MODE_DOWN_TOAST_MESSAGE}
        </div>
      )}

      {/* S9: completion celebration particles (1s) */}
      {showCelebration && (
        <div
          className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center"
          aria-hidden
        >
          {[
            { anim: "animate-cp1", color: "bg-spec-100", delay: 0 },
            { anim: "animate-cp2", color: "bg-spec-70", delay: 30 },
            { anim: "animate-cp3", color: "bg-spec-40", delay: 60 },
            { anim: "animate-cp4", color: "bg-spec-100", delay: 90 },
            { anim: "animate-cp5", color: "bg-spec-70", delay: 20 },
            { anim: "animate-cp6", color: "bg-spec-40", delay: 50 },
            { anim: "animate-cp7", color: "bg-spec-100", delay: 80 },
            { anim: "animate-cp8", color: "bg-spec-70", delay: 40 },
          ].map((p, i) => (
            <div
              key={i}
              className={`absolute left-1/2 top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${p.color} ${p.anim}`}
              style={{ animationDelay: `${p.delay}ms` }}
            />
          ))}
        </div>
      )}

      <div className="flex-1 px-4 py-4 flex justify-center">
        <div className="w-full max-w-3xl space-y-4 pb-28">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">오늘 컨디션 기반 일정 조정</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              대시보드로
            </Button>
          </div>

          {(dailySummary || recommendedPatch || medicalAttentionNotice) && (
            <SpecCard glass className="p-4">
              <TodayConditionBanner
                summary={dailySummary}
                recommendedPatch={recommendedPatch}
                patchLoading={patchLoading}
                patchError={patchError}
                patchResultMessage={patchResultMessage}
                medicalAttentionNotice={medicalAttentionNotice}
                fallbackConfidence={cycleConfidence}
                onApplyPatch={applyRecommendedPatch}
                onEditInputs={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              />
            </SpecCard>
          )}

          <SpecCard glass className="p-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    DayPlan ID
                  </label>
                  <input
                    type="number"
                    value={dayIdInput}
                    onChange={(e) => setDayIdInput(e.target.value)}
                    placeholder={state.dayId != null ? String(state.dayId) : "예: 1"}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    수면 시간
                  </label>
                  <select
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value as SleepHours)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="LT5">5시간 미만</option>
                    <option value="H5_6">5~6시간</option>
                    <option value="H6_7">6~7시간</option>
                    <option value="H7_8">7~8시간</option>
                    <option value="GT8">8시간 이상</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      피로 (0~10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={fatigue}
                      onChange={(e) => setFatigue(Number(e.target.value || 0))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      통증 (0~10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={pain}
                      onChange={(e) => setPain(Number(e.target.value || 0))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      식사와 연동 (선택)
                    </label>
                    <select
                      value={selectedMealId}
                      onChange={(e) => setSelectedMealId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">식사 항목 선택</option>
                      {mealOptions.map((meal) => (
                        <option key={meal.meal_id} value={meal.meal_id}>
                          {meal.meal_id} | {meal.meal_time.slice(0, 16).replace("T", " ")}
                        </option>
                      ))}
                    </select>
                    {mealLoadError && (
                      <p className="mt-1 text-xs text-red-600">{mealLoadError}</p>
                    )}
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={linkMealSignal}
                        onChange={(e) => setLinkMealSignal(e.target.checked)}
                      />
                      식후 신호 전송
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    기분
                  </label>
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value as Mood)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="calm">차분함</option>
                    <option value="ok">보통</option>
                    <option value="anxious">불안</option>
                    <option value="low">무기력</option>
                    <option value="irritated">예민</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    생리 상태 (선택)
                  </label>
                  <select
                    value={periodStatus}
                    onChange={(e) => setPeriodStatus(e.target.value as PeriodStatus)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">선택 안 함</option>
                    <option value="on">생리 중</option>
                    <option value="pre">생리 전</option>
                    <option value="post">생리 후</option>
                    <option value="none">해당 없음</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    생리 시작일 (period_start_date)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={periodStartDate}
                      onChange={(e) => setPeriodStartDate(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPeriodStartDate(new Date().toISOString().slice(0, 10))}
                    >
                      오늘
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-rose-700">
                    생리 빠른 체크 (약 1분)
                  </div>
                  <span className="text-[11px] text-rose-700">자가 입력</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      출혈량 (0~2, 선택)
                    </label>
                    <select
                      value={menstrualBleedingLevel}
                      onChange={(e) => setMenstrualBleedingLevel(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">선택 안 함</option>
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      복통 (0~4, 필수)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={menstrualCramps}
                      onChange={(e) => setMenstrualCramps(Number(e.target.value || 0))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      피로 (0~4, 필수)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={menstrualFatigue}
                      onChange={(e) => setMenstrualFatigue(Number(e.target.value || 0))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      예민함 (0~4, 필수)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={menstrualIrritability}
                      onChange={(e) => setMenstrualIrritability(Number(e.target.value || 0))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      집중 저하 (0~4, 선택)
                    </label>
                    <select
                      value={menstrualFocusDrop}
                      onChange={(e) => setMenstrualFocusDrop(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">선택 안 함</option>
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      메모 (선택, 0~60자)
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      value={menstrualNotes}
                      onChange={(e) => setMenstrualNotes(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? "제출 중..." : "컨디션 적용"}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-600">
                  이 기능은 의료적 진단/치료/예후를 제공하지 않으며, 계획 보조 용도입니다.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          </SpecCard>

          {/* Google Calendar context (Checkin) */}
          <SpecCard glass className="p-4">
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    오늘 Google 이벤트
                  </span>
                  {targetDate && (
                    <span className="text-[11px] text-gray-500">
                      ({targetDate})
                    </span>
                  )}
                </div>
                {!googleConnected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={connectGoogle}
                  >
                    Google Calendar 연결
                  </Button>
                ) : lastSync ? (
                  <span className="text-[11px] text-gray-500">
                    마지막 동기화{" "}
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
              <div className="space-y-1 max-h-28 overflow-auto rounded-md bg-white/70 border border-gray-100 px-3 py-2">
                {googleLoading && (
                  <div className="text-gray-500">Google 이벤트 불러오는 중...</div>
                )}
                {!googleLoading && googleEvents.length === 0 && (
                  <div className="text-gray-400">
                    {googleConnected
                      ? "이 날짜에 Google 이벤트가 없습니다."
                      : "여기에서 함께 보려면 Google을 연결해 주세요."}
                  </div>
                )}
                {googleEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 text-gray-700"
                  >
                    <span className="text-gray-400">*</span>
                    <span className="truncate">
                      {ev.start} ~ {ev.end} - {ev.displayTitle ?? ev.title}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">
                조정 결과가 기존 Google 이벤트와 충돌하지 않는지 빠르게 확인할 수 있습니다.
                
              </p>
            </div>
          </SpecCard>

          {/* result + diff view */}
          {targetPlan && (
            <SpecCard glass className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      최종 모드
                    </span>
                    <ModeBadge mode={specMode} />
                    <span className="text-xs text-gray-600">
                      (적용됨: {response?.adapt_applied ? "예" : "아니오"})
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    수면/피로/통증 신호를 반영해 시작 성공률을 우선했습니다.
                  </div>
                </div>

                {/* S7: manual adapt / S8: run simulation */}
                {response?.google_calendar_sync_message ? (
                  <p
                    className={`text-xs ${
                      response?.google_calendar_synced
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {response.google_calendar_sync_message}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAdaptClick}
                    disabled={adaptLoading || response?.condition_id == null}
                  >
                    {adaptLoading ? "조정 중..." : "수동으로 계획 조정"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSimulateClick}
                    disabled={simulateLoading || !targetPlan}
                  >
                    {simulateLoading ? "시작 중..." : "시뮬레이션 실행"}
                  </Button>
                  {adaptError && (
                    <span className="text-xs text-red-600">{adaptError}</span>
                  )}
                </div>

                {/* S8: job status / result / error */}
                {jobId != null && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
                    <div className="font-semibold text-gray-800 mb-1">
                      시뮬레이션 작업 #{jobId}
                    </div>
                    {jobStatus === null && (
                      <p className="text-gray-600">
                        처리 중 (4초마다 확인, 탭이 숨김이면 일시정지).
                      </p>
                    )}
                    {jobStatus === "completed" && (
                      <pre className="mt-2 p-2 bg-white rounded border border-gray-200 overflow-auto max-h-40 text-gray-800">
                        {JSON.stringify(jobResult, null, 2)}
                      </pre>
                    )}
                    {jobStatus === "failed" && (
                      <p className="text-red-600 mt-1">{jobError ?? "실패"}</p>
                    )}
                  </div>
                )}
                {jobError != null && jobId == null && (
                  <p className="text-xs text-red-600">{jobError}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-gray-700 mb-2">
                      기존 계획
                    </div>
                    {(originalPlan?.items || []).map((item, idx) => (
                      <div
                        key={idx}
                        className="mb-2 rounded-md border border-gray-200 bg-white p-2 animate-fade-in-up"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="font-medium text-gray-800">
                          작업 #{item.task_id ?? idx + 1}
                        </div>
                        <div className="text-gray-600">
                          블록: {item.planned_block_minutes ?? "-"}분
                        </div>
                      </div>
                    ))}
                    {(!originalPlan?.items || originalPlan.items.length === 0) && (
                      <div className="text-gray-500">
                        기존 DayPlan 데이터가 없습니다. (임시 테스트 모드)
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold text-gray-700 mb-2">
                      조정된 계획
                    </div>
                    {(targetPlan.items || []).map((item, idx) => {
                      const hasFirstTwoMinStep =
                        item.micro_steps?.some((s) => isFirstTwoMinuteStep(s)) ?? false;
                      return (
                        <div
                          key={idx}
                          className="mb-2 rounded-md border border-indigo-100 bg-white p-2 animate-fade-in-up"
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-800">
                              작업 #{item.task_id ?? idx + 1}
                            </div>
                            {hasFirstTwoMinStep && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                첫 2분 시작
                              </span>
                            )}
                          </div>
                          <div className="text-gray-600">
                            블록: {item.planned_block_minutes ?? "-"}분
                          </div>
                          {Array.isArray(item.micro_steps) &&
                            item.micro_steps.length > 0 && (
                              <div className="mt-1 text-gray-600">
                                <div className="font-medium mb-0.5">
                                  마이크로 스텝
                                </div>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {item.micro_steps.map((m, i) => (
                                    <li key={i}>{m}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      );
                    })}
                    {(!targetPlan.items || targetPlan.items.length === 0) && (
                      <div className="text-gray-500">
                        조정된 계획이 없습니다. (변경 없음)
                      </div>
                    )}
                  </div>
                </div>

                {/* protected block info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="text-gray-700">
                    <div className="font-semibold mb-1">보호 블록 (이전)</div>
                    <div>
                      {diff.protectedBefore
                        ? `${diff.protectedBefore}분`
                        : "설정 안 됨"}
                    </div>
                  </div>
                  <div className="text-gray-700">
                    <div className="font-semibold mb-1">보호 블록 (이후)</div>
                    <div>
                      {diff.protectedAfter
                        ? `${diff.protectedAfter}분`
                        : "설정 안 됨"}
                    </div>
                  </div>
                </div>

                {/* shrink items */}
                {diff.shrunk.length > 0 && (
                  <div className="text-xs text-gray-700">
                    <div className="font-semibold mb-1">
                      시간 축소 블록
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {diff.shrunk.map(({ before, after }, idx) => (
                        <li key={idx}>
                          작업 #{after.task_id ?? idx + 1}:{" "}
                          {before.planned_block_minutes ?? "-"}분{" "}
                          {after.planned_block_minutes ?? "-"}분
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                      {/* 오늘 제외/지연 항목 */}
                {diff.droppedOrDelayed.length > 0 && (
                  <div className="text-xs text-gray-700">
                    <div className="font-semibold mb-1">
                      오늘 제외/지연된 작업
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {diff.droppedOrDelayed.map((item, idx) => (
                        <li key={idx}>
                          작업 #{item.task_id ?? idx + 1}
                          {item.planned_block_minutes != null &&
                            ` - ${item.planned_block_minutes}분`
                          }
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* S7: manual adapt result */}
                {adaptResult && (
                  <div className="border-t border-gray-200 pt-4 space-y-3 text-xs">
                    <div className="font-semibold text-gray-800">
                      수동 조정 결과
                    </div>
                    {adaptResult.actions_applied.length > 0 && (
                      <div className="text-gray-700">
                        <span className="font-medium">적용된 액션: </span>
                        {adaptResult.actions_applied.join(", ")}
                      </div>
                    )}
                    {adaptResult.google_calendar_sync_message ? (
                      <p
                        className={`text-xs ${
                          adaptResult.google_calendar_synced
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        {adaptResult.google_calendar_sync_message}
                      </p>
                    ) : null}
                    {adaptResult.soothe_requested && (
                      <div className="text-amber-700">
                        자기 진정 요청: 예 (작업 중단이 필요할 수 있음)
                      </div>
                    )}
                    {adaptResult.updated_plan?.items &&
                    adaptResult.updated_plan.items.length > 0 ? (
                      <div>
                        <div className="font-semibold text-gray-700 mb-2">
                          수동 조정 후 계획 (갱신된 계획)
                        </div>
                        <div className="space-y-2">
                          {adaptResult.updated_plan.items.map(
                            (item: PlanItem, idx: number) => (
                              <div
                                key={item.item_id ?? idx}
                                className="rounded-md border border-indigo-100 bg-white p-2 animate-fade-in-up"
                                style={{ animationDelay: `${idx * 50}ms` }}
                              >
                                <div className="font-medium text-gray-800">
                                  작업 #{item.task_id ?? idx + 1}
                                </div>
                                <div className="text-gray-600">
                                  블록: {item.planned_block_minutes ?? "-"}분
                                </div>
                                {Array.isArray(item.micro_steps) &&
                                  item.micro_steps.length > 0 && (
                                    <ul className="list-disc list-inside mt-1 text-gray-600">
                                      {item.micro_steps.map((m, i) => (
                                        <li key={i}>{m}</li>
                                      ))}
                                    </ul>
                                  )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : (
                      adaptResult.updated_plan && (
                        <div className="text-gray-500">
                          조정 후 계획이 비어 있습니다.
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </SpecCard>
          )}
        </div>
      </div>

      {/* bottom CTA: 2-minute start now (S3 gradient + icon) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--spec-glass-bg)] dark:bg-[var(--spec-glass-bg-dark)] border-t border-[var(--spec-glass-border)] backdrop-blur-xl shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              지금 할 수 있는 가장 작은 시작
            </div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              {ctaLabel}
            </div>
          </div>
          <button
            type="button"
            className="min-w-[160px] px-4 py-2.5 rounded-lg font-semibold text-white text-sm bg-gradient-to-r from-spec-100 to-spec-70 hover:from-emerald-500 hover:to-amber-500 transition-all duration-200 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-spec-100 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            onClick={() => {
              console.log("2분 블록 시작:", ctaLabel);
            }}
          >
            <span aria-hidden>&gt;</span>
            딱 2분만 시작
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckinRebalancePage;

