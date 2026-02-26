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

  /* S8: ?쒕??덉씠??+ Job ?대쭅 */
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
  const firstMicroStepRaw =
    (firstTask?.micro_steps && firstTask.micro_steps[0]) || "泥?2遺?李⑹닔 (?앹꽦 ?꾩슂)";
  const hasFirstTwoMin =
    firstTask?.micro_steps?.some(
      (s) => typeof s === "string" && s.includes("泥?2遺?李⑹닔")
    ) ?? false;
  const ctaLabel = hasFirstTwoMin
    ? firstMicroStepRaw
    : `2遺?李⑹닔(?앹꽦 ?꾩슂): ${firstMicroStepRaw}`;

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
      setPatchError("?곸슜 媛?ν븳 ?⑥튂媛 ?놁뒿?덈떎.");
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
      setPatchResultMessage(data.message || "?⑥튂瑜??곸슜?덉뒿?덈떎.");
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
      setPatchError(e instanceof Error ? e.message : "?⑥튂 ?곸슜???ㅽ뙣?덉뒿?덈떎.");
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

  /* S8: Job ?대쭅 ??4珥?媛꾧꺽, ??鍮꾧??????쇱떆?뺤? */
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
          setJobError(typeof data.result === "string" ? data.result : data.detail ?? "Job ?ㅽ뙣");
        }
      } catch {
        // ?ㅽ듃?뚰겕 ?ㅻ쪟 ???ㅼ쓬 ?대쭅?먯꽌 ?ъ떆??
      }
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  /* S9: Job completed ??異뺥븯 ?④낵 1??*/
  useEffect(() => {
    if (jobStatus !== "completed") return;
    setShowCelebration(true);
    const t = setTimeout(() => setShowCelebration(false), 1200);
    return () => clearTimeout(t);
  }, [jobStatus]);

  // Checkin/Adapt ???DayPlan???좎쭨 湲곗??쇰줈 Google ?쇱젙 ?숆린??
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
        const message = e instanceof Error ? e.message : "Failed to load meals";
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
      setError("癒쇱? DayPlan(day_id)???좏깮?섍굅??/plan/day?먯꽌 怨꾪쉷????ν븯?몄슂.");
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
      console.error("condition/checkin ?ㅻ쪟:", e);
      setError("而⑤뵒??泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdaptClick = async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    const conditionId = response?.condition_id;
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setAdaptError("day_id媛 ?놁뒿?덈떎. ?꾩뿉??DayPlan ID瑜??낅젰?섏꽭??");
      return;
    }
    if (conditionId == null) {
      setAdaptError("癒쇱? '而⑤뵒??諛섏쁺?섍린'瑜??ㅽ뻾??二쇱꽭??");
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
      console.error("adapt/day ?ㅻ쪟:", e);
      setAdaptError(
        e instanceof Error ? e.message : "?섎룞 議곗젙 ?붿껌???ㅽ뙣?덉뒿?덈떎."
      );
    } finally {
      setAdaptLoading(false);
    }
  };

  const handleSimulateClick = async () => {
    const numericDayId = Number(dayIdInput || state.dayId);
    if (!numericDayId || Number.isNaN(numericDayId)) {
      setJobError("day_id媛 ?놁뒿?덈떎. DayPlan ID瑜??낅젰?섏꽭??");
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
      if (id == null) throw new Error("job_id ?놁쓬");
      setJobId(id);
    } catch (e) {
      console.error("simulate/day ?ㅻ쪟:", e);
      setJobError(e instanceof Error ? e.message : "?쒕??덉씠???쒖옉 ?ㅽ뙣");
    } finally {
      setSimulateLoading(false);
    }
  };

  const MODE_DOWN_TOAST_MESSAGE =
    "?섎㈃/?쇰줈/?듭쬆 ?좏샇濡??쒖옉 ?깃났瑜좎쓣 ?곗꽑?댁슂.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex flex-col">
      {/* S4: 紐⑤뱶 ?섑뼢 ?좎뒪????final_mode 70/40??????以?*/}
      {showModeDownToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-gray-800 text-white text-sm shadow-lg animate-fade-in-up"
        >
          {MODE_DOWN_TOAST_MESSAGE}
        </div>
      )}

      {/* S9: ?쒕? ?꾨즺 ???뚰떚??異뺥븯 ?④낵 1??*/}
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
            <h1 className="text-xl font-bold text-gray-800">?㈉ 而⑤뵒??湲곕컲 ?쇱젙 ?ъ“??</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              ??쒕낫?쒕줈 ?뚯븘媛湲?
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
                    placeholder={state.dayId != null ? String(state.dayId) : "?? 1"}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    ?섎㈃ ?쒓컙
                  </label>
                  <select
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value as SleepHours)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="LT5">5?쒓컙 誘몃쭔</option>
                    <option value="H5_6">5~6?쒓컙</option>
                    <option value="H6_7">6~7?쒓컙</option>
                    <option value="H7_8">7~8?쒓컙</option>
                    <option value="GT8">8?쒓컙 ?댁긽</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      ?쇰줈(0~10)
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
                      ?듭쬆(0~10)
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
                      Link with meal (optional)
                    </label>
                    <select
                      value={selectedMealId}
                      onChange={(e) => setSelectedMealId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select meal_id</option>
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
                      send post-meal signal
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    湲곕텇
                  </label>
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value as Mood)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="calm">李⑤텇??</option>
                    <option value="ok">愿쒖갖??</option>
                    <option value="anxious">遺덉븞</option>
                    <option value="low">?곗슱/湲곗슫 ?놁쓬</option>
                    <option value="irritated">?덈?/吏쒖쬆</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    ?앸━ ?곹깭(?좏깮)
                  </label>
                  <select
                    value={periodStatus}
                    onChange={(e) => setPeriodStatus(e.target.value as PeriodStatus)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">?좏깮 ????</option>
                    <option value="on">?앸━ 以?</option>
                    <option value="pre">?앸━ ??</option>
                    <option value="post">?앸━ 吏곹썑</option>
                    <option value="none">?대떦 ?놁쓬</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    異쒗삁 ?쒖옉??period_start_date)
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
                      ?ㅻ뒛
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-rose-700">
                    Menstrual Quick Check (?섎（ 1?? 10珥?
                  </div>
                  <span className="text-[11px] text-rose-700">self-report</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      異쒗삁(0~2, ?좏깮)
                    </label>
                    <select
                      value={menstrualBleedingLevel}
                      onChange={(e) => setMenstrualBleedingLevel(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">?좏깮 ????</option>
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      寃쎈젴(0~4, ?꾩닔)
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
                      ?쇰줈(0~4, ?꾩닔)
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
                      ?덈?(0~4, ?꾩닔)
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
                      吏묒쨷???0~4, ?좏깮)
                    </label>
                    <select
                      value={menstrualFocusDrop}
                      onChange={(e) => setMenstrualFocusDrop(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">?좏깮 ????</option>
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
                      硫붾え(?좏깮, 0~60??
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
                    {loading ? "?ъ“??以?.." : "而⑤뵒??諛섏쁺?섍린"}
                  </Button>
                </div>
                <p className="text-[11px] text-gray-600">
                  ??湲곕뒫? ?섎즺 吏꾨떒/移섎즺/?덊썑 ?먮떒???쒓났?섏? ?딆쑝硫? ?⑦꽩 湲곕컲 ?쇱젙 蹂댁“?⑹엯?덈떎.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          </SpecCard>

          {/* Google 罹섎┛??而⑦뀓?ㅽ듃 (Checkin?? */}
          <SpecCard glass className="p-4">
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    ?뱟 ?ㅻ뒛??Google ?쇱젙
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
                    Google 罹섎┛???곕룞
                  </Button>
                ) : lastSync ? (
                  <span className="text-[11px] text-gray-500">
                    留덉?留??숆린??{" "}
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
                  <div className="text-gray-500">Google ?쇱젙??遺덈윭?ㅻ뒗 以묅?</div>
                )}
                {!googleLoading && googleEvents.length === 0 && (
                  <div className="text-gray-400">
                    {googleConnected
                      ? "?대떦 ?좎쭨???깅줉??Google ?쇱젙???놁뒿?덈떎."
                      : "?곕룞 ???닿납?먯꽌 Google ?쇱젙???④퍡 蹂????덉뒿?덈떎."}
                  </div>
                )}
                {googleEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 text-gray-700"
                  >
                    <span className="text-gray-400">??</span>
                    <span className="truncate">
                      {ev.start} ~ {ev.end} 쨌 {ev.displayTitle ?? ev.title}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">
                而⑤뵒???ъ“??寃곌낵媛, ?꾩쓽 Google ?쇱젙怨?異⑸룎?섏? ?딅뒗吏 ?쒓컖?곸쑝濡?
                ?④퍡 ?뺤씤?????덉뒿?덈떎.
              </p>
            </div>
          </SpecCard>

          {/* 寃곌낵 諛?Diff 酉?*/}
          {targetPlan && (
            <SpecCard glass className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      理쒖쥌 紐⑤뱶
                    </span>
                    <ModeBadge mode={specMode} />
                    <span className="text-xs text-gray-600">
                      (adapt_applied: {response?.adapt_applied ? "true" : "false"})
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    ?섎㈃/?쇰줈/?듭쬆 ?좏샇濡??명빐 ?쒖옉 ?깃났瑜좎쓣 ?곗꽑?⑸땲??
                  </div>
                </div>

                {/* S7: ?섎룞 Adapt / S8: ?쒕??덉씠???ㅽ뻾 */}
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
                    {adaptLoading ? "議곗젙 以?.." : "?섎룞?쇰줈 怨꾪쉷 議곗젙"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSimulateClick}
                    disabled={simulateLoading || !targetPlan}
                  >
                    {simulateLoading ? "?쒖옉 以?.." : "?쒕??덉씠???ㅽ뻾"}
                  </Button>
                  {adaptError && (
                    <span className="text-xs text-red-600">{adaptError}</span>
                  )}
                </div>

                {/* S8: Job ?대쭅 ?곹깭 / 寃곌낵 / ?먮윭 */}
                {jobId != null && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
                    <div className="font-semibold text-gray-800 mb-1">
                      ?쒕??덉씠??Job #{jobId}
                    </div>
                    {jobStatus === null && (
                      <p className="text-gray-600">
                        泥섎━ 以묅?(4珥덈쭏???뺤씤?⑸땲?? ??쓣 蹂댁씠寃??섎㈃ 媛깆떊?⑸땲??)
                      </p>
                    )}
                    {jobStatus === "completed" && (
                      <pre className="mt-2 p-2 bg-white rounded border border-gray-200 overflow-auto max-h-40 text-gray-800">
                        {JSON.stringify(jobResult, null, 2)}
                      </pre>
                    )}
                    {jobStatus === "failed" && (
                      <p className="text-red-600 mt-1">{jobError ?? "?ㅽ뙣"}</p>
                    )}
                  </div>
                )}
                {jobError != null && jobId == null && (
                  <p className="text-xs text-red-600">{jobError}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-gray-700 mb-2">
                      湲곗〈 怨꾪쉷
                    </div>
                    {(originalPlan?.items || []).map((item, idx) => (
                      <div
                        key={idx}
                        className="mb-2 rounded-md border border-gray-200 bg-white p-2 animate-fade-in-up"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="font-medium text-gray-800">
                          Task #{item.task_id ?? idx + 1}
                        </div>
                        <div className="text-gray-600">
                          釉붾줉: {item.planned_block_minutes ?? "-"}遺?
                        </div>
                      </div>
                    ))}
                    {(!originalPlan?.items || originalPlan.items.length === 0) && (
                      <div className="text-gray-500">
                        湲곗〈 DayPlan ?뺣낫媛 ?놁뒿?덈떎 (?뚯뒪???꾩떆 紐⑤뱶).
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold text-gray-700 mb-2">
                      議곗젙??怨꾪쉷
                    </div>
                    {(targetPlan.items || []).map((item, idx) => {
                      const hasFirstTwoMinStep =
                        item.micro_steps?.some(
                          (s) =>
                            typeof s === "string" && s.includes("泥?2遺?李⑹닔")
                        ) ?? false;
                      return (
                        <div
                          key={idx}
                          className="mb-2 rounded-md border border-indigo-100 bg-white p-2 animate-fade-in-up"
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-800">
                              Task #{item.task_id ?? idx + 1}
                            </div>
                            {hasFirstTwoMinStep && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                泥?2遺?李⑹닔
                              </span>
                            )}
                          </div>
                          <div className="text-gray-600">
                            釉붾줉: {item.planned_block_minutes ?? "-"}遺?
                          </div>
                          {Array.isArray(item.micro_steps) &&
                            item.micro_steps.length > 0 && (
                              <div className="mt-1 text-gray-600">
                                <div className="font-medium mb-0.5">
                                  micro_steps
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
                        議곗젙??怨꾪쉷???놁뒿?덈떎. (蹂寃??놁쓬)
                      </div>
                    )}
                  </div>
                </div>

                {/* 蹂댄샇 釉붾줉 ?뺣낫 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="text-gray-700">
                    <div className="font-semibold mb-1">蹂댄샇 釉붾줉(?댁쟾)</div>
                    <div>
                      {diff.protectedBefore
                        ? `${diff.protectedBefore}분`
                        : "설정 없음"}
                    </div>
                  </div>
                  <div className="text-gray-700">
                    <div className="font-semibold mb-1">蹂댄샇 釉붾줉(?댄썑)</div>
                    <div>
                      {diff.protectedAfter
                        ? `${diff.protectedAfter}분`
                        : "설정 없음"}
                    </div>
                  </div>
                </div>

                {/* shrink???묒뾽 */}
                {diff.shrunk.length > 0 && (
                  <div className="text-xs text-gray-700">
                    <div className="font-semibold mb-1">
                      ?깍툘 異뺤냼??釉붾줉(shrink)
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {diff.shrunk.map(({ before, after }, idx) => (
                        <li key={idx}>
                          Task #{after.task_id ?? idx + 1}:{" "}
                          {before.planned_block_minutes ?? "-"}분{" "}
                          {after.planned_block_minutes ?? "-"}분
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* drop/delay ?뱀뀡 */}
                {diff.droppedOrDelayed.length > 0 && (
                  <div className="text-xs text-gray-700">
                    <div className="font-semibold mb-1">
                      ?벀 ?ㅻ뒛 ?쒖쇅/?댁썡???묒뾽 (drop/delay)
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {diff.droppedOrDelayed.map((item, idx) => (
                        <li key={idx}>
                          Task #{item.task_id ?? idx + 1}
                          {item.planned_block_minutes != null &&
                            ` - ${item.planned_block_minutes}분`
                          }
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* S7: ?섎룞 Adapt 寃곌낵 */}
                {adaptResult && (
                  <div className="border-t border-gray-200 pt-4 space-y-3 text-xs">
                    <div className="font-semibold text-gray-800">
                      ?섎룞 議곗젙 寃곌낵
                    </div>
                    {adaptResult.actions_applied.length > 0 && (
                      <div className="text-gray-700">
                        <span className="font-medium">?곸슜???≪뀡: </span>
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
                        soothe_requested: true (?먭레?꾟넃, 怨쇱젙 以묒떖 沅뚯옣)
                      </div>
                    )}
                    {adaptResult.updated_plan?.items &&
                    adaptResult.updated_plan.items.length > 0 ? (
                      <div>
                        <div className="font-semibold text-gray-700 mb-2">
                          ?섎룞 議곗젙 ??怨꾪쉷 (updated_plan)
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
                                  Task #{item.task_id ?? idx + 1}
                                </div>
                                <div className="text-gray-600">
                                  釉붾줉: {item.planned_block_minutes ?? "-"}遺?
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
                          議곗젙 ??怨꾪쉷??鍮꾩뼱 ?덉뒿?덈떎.
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

      {/* ?섎떒 CTA: 吏湲?2遺?李⑹닔 ??S3 洹몃씪?곗씠??+ ?꾩씠肄?*/}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--spec-glass-bg)] dark:bg-[var(--spec-glass-bg-dark)] border-t border-[var(--spec-glass-border)] backdrop-blur-xl shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              吏湲?諛붾줈 ?????덈뒗 ??嫄몄쓬
            </div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              {ctaLabel}
            </div>
          </div>
          <button
            type="button"
            className="min-w-[160px] px-4 py-2.5 rounded-lg font-semibold text-white text-sm bg-gradient-to-r from-spec-100 to-spec-70 hover:from-emerald-500 hover:to-amber-500 transition-all duration-200 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-spec-100 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            onClick={() => {
              console.log("2遺?李⑹닔 ?쒖옉:", ctaLabel);
            }}
          >
            <span aria-hidden>??</span>
            吏湲?2遺꾨쭔 李⑹닔?섍린
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckinRebalancePage;

