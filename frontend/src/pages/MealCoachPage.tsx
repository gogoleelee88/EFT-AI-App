import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  createMeal,
  estimateMeal,
  getAdvice,
  getWeeklySummary,
  submitPostCheck,
  uploadMealPhotos,
  type AdviceOutput,
  type MealCreateOutput,
  type MealEstimateOutput,
  type PostCheckOutput,
  type SlotType,
  type TrackType,
  type WeeklySummaryOutput,
} from "../services/mealCoachService";

const sliderClass = "w-full accent-emerald-600";
const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const cardClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const labelClass = "text-xs text-slate-500";
const valueClass = "text-sm text-slate-800";

function clamp04(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(4, Math.round(n)));
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 py-1 last:border-0 last:pb-0">
      <div className={labelClass}>{label}</div>
      <div className={valueClass}>{value}</div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MealCoachPage: React.FC = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mealState, setMealState] = useState<"FASTING" | "ATE">("ATE");
  const [fastingHours, setFastingHours] = useState<number>(12);
  const [mealRecord, setMealRecord] = useState<MealCreateOutput | null>(null);

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [track, setTrack] = useState<TrackType>("AUTO");
  const [barcode, setBarcode] = useState("");
  const [estimate, setEstimate] = useState<MealEstimateOutput | null>(null);

  const [slot, setSlot] = useState<SlotType>("T30");
  const [sleepiness, setSleepiness] = useState(2);
  const [focusDrop, setFocusDrop] = useState(2);
  const [sluggishness, setSluggishness] = useState(2);
  const [giDiscomfort, setGiDiscomfort] = useState(0);
  const [headache, setHeadache] = useState(0);
  const [caffeineUsed, setCaffeineUsed] = useState(false);

  const [postCheck, setPostCheck] = useState<PostCheckOutput | null>(null);
  const [advice, setAdvice] = useState<AdviceOutput | null>(null);
  const [summary, setSummary] = useState<WeeklySummaryOutput | null>(null);

  const mealId = mealRecord?.meal_id ?? "";
  const totalPhotoSize = useMemo(
    () => photoFiles.reduce((acc, file) => acc + file.size, 0),
    [photoFiles]
  );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateMeal = () =>
    run(async () => {
      const payload = {
        meal_state: mealState,
        fasting_hours: mealState === "FASTING" ? fastingHours : undefined,
        source: "manual",
        meal_time: new Date().toISOString(),
      };
      const created = await createMeal(payload, user?.uid);
      setMealRecord(created);
      setEstimate(null);
      setPostCheck(null);
      setAdvice(null);
    });

  const handleUploadPhotos = () =>
    run(async () => {
      if (!mealId) throw new Error("Create a meal first.");
      if (photoFiles.length === 0) throw new Error("Select at least one image file.");
      const uploaded = await uploadMealPhotos(mealId, photoFiles, user?.uid);
      if (uploaded.auto_estimate) {
        setEstimate(uploaded.auto_estimate);
      }
    });

  const handleEstimate = () =>
    run(async () => {
      if (!mealId) throw new Error("Create a meal first.");
      const est = await estimateMeal(
        mealId,
        {
          track,
          barcode: barcode.trim() || undefined,
          force_recompute: true,
        },
        user?.uid
      );
      setEstimate(est);
    });

  const handleSubmitPostCheck = () =>
    run(async () => {
      if (!mealId) throw new Error("Create a meal first.");
      const check = await submitPostCheck(
        mealId,
        {
          slot,
          sleepiness: clamp04(sleepiness),
          focus_drop: clamp04(focusDrop),
          sluggishness: clamp04(sluggishness),
          gi_discomfort: clamp04(giDiscomfort),
          headache: clamp04(headache),
          caffeine_used: caffeineUsed,
          submitted_at: new Date().toISOString(),
        },
        user?.uid
      );
      setPostCheck(check);
      const nextAdvice = await getAdvice(mealId, user?.uid);
      setAdvice(nextAdvice);
    });

  const handleLoadWeekly = () =>
    run(async () => {
      const s = await getWeeklySummary(user?.uid);
      setSummary(s);
    });

  const navigate = useNavigate();

  if (authLoading) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className={cardClass}>인증 상태를 확인하고 있습니다...</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className={cardClass}>
          <h1 className="text-xl font-semibold text-slate-800">식후 컨디션 코치</h1>
          <p className="mt-2 text-sm text-slate-600">
            식후 컨디션 기반 업무 모드 코칭은 로그인 후 이용할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login?next=/meal-coach")}
            className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            로그인 하기
          </button>
        </div>
      </main>
    );
  }

  if (false && !isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className={cardClass}>
          <h1 className="text-xl font-semibold text-slate-800">식후 컨디션 코치</h1>
          <p className="mt-2 text-sm text-slate-600">
            로그인 후 식후 컨디션 기반 업무 모드 코칭을 사용할 수 있습니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <section className={cardClass}>
        <h1 className="text-xl font-semibold text-slate-800">식후 컨디션 기반 업무 모드</h1>
        <p className="mt-1 text-sm text-slate-600">
          웰니스 코칭 전용 기능입니다. 진단/치료 목적이 아닙니다.
        </p>
      </section>

      {error && (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </section>
      )}

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-semibold text-slate-800">1) 식사 기록</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            식사 상태
            <select
              className={inputClass}
              value={mealState}
              onChange={(e) => setMealState(e.target.value as "FASTING" | "ATE")}
            >
              <option value="ATE">ATE</option>
              <option value="FASTING">FASTING</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            공복 시간
            <input
              className={inputClass}
              type="number"
              min={0}
              max={72}
              step={0.5}
              value={fastingHours}
              onChange={(e) => setFastingHours(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={handleCreateMeal}
        >
          식사 생성
        </button>
        {mealRecord && (
          <div className="mt-3 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-700">식사 생성 결과</h3>
            <DataRow label="meal_id" value={mealRecord.meal_id} />
            <DataRow label="meal_state" value={mealRecord.meal_state} />
            <DataRow label="meal_time" value={formatDateTime(mealRecord.meal_time)} />
            <DataRow
              label="fasting_hours"
              value={mealRecord.fasting_hours == null ? "-" : `${mealRecord.fasting_hours}h`}
            />
            <DataRow label="source" value={mealRecord.source} />
            <DataRow
              label="check_windows"
              value={
                mealRecord.check_windows ? (
                  <div className="space-y-1">
                    <div>T30: {formatDateTime(mealRecord.check_windows.t30_due_at)}</div>
                    <div>T90: {formatDateTime(mealRecord.check_windows.t90_due_at)}</div>
                  </div>
                ) : (
                  "-"
                )
              }
            />
            <DataRow label="status" value={mealRecord.status} />
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-semibold text-slate-800">2) 사진 업로드 및 영양 추정</h2>
        <label className="text-sm">
          식사 사진 (최대 10장)
          <input
            className={`${inputClass} mt-1`}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []).slice(0, 10))}
          />
        </label>
        {photoFiles.length > 0 && (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <div>
              선택: {photoFiles.length}개, 총 {formatFileSize(totalPhotoSize)}
            </div>
            <div className="mt-1 space-y-0.5">
              {photoFiles.map((file) => (
                <div key={`${file.name}-${file.lastModified}`}>- {file.name}</div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            트랙
            <select
              className={inputClass}
              value={track}
              onChange={(e) => setTrack(e.target.value as TrackType)}
            >
              <option value="AUTO">AUTO</option>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            바코드 (선택)
            <input
              className={inputClass}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="880..."
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            disabled={busy || !mealId}
            onClick={handleUploadPhotos}
        >
            사진 업로드
          </button>
          <button
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || !mealId}
            onClick={handleEstimate}
        >
            영양 추정
          </button>
        </div>
        {estimate && (
          <div className="mt-3 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-700">영양 추정 결과</h3>
            <DataRow label="estimate_id" value={estimate.estimate_id} />
            <DataRow label="track_used" value={estimate.track_used} />
            <DataRow label="confidence" value={`${Math.round(estimate.confidence * 100)}%`} />
            <DataRow label="영양성분" value={
              <div className="space-y-1">
                <div>칼로리: {estimate.nutrition.calories} kcal</div>
                <div>탄수화물: {estimate.nutrition.carbs_g} g</div>
                <div>단백질: {estimate.nutrition.protein_g} g</div>
                <div>지방: {estimate.nutrition.fat_g} g</div>
                <div>나트륨: {estimate.nutrition.sodium_mg} mg</div>
              </div>
            } />
            <DataRow label="labels" value={estimate.labels.join(", ") || "-"} />
            <DataRow label="uncertainty_reason" value={estimate.uncertainty_reason.join(", ") || "-"} />
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-semibold text-slate-800">3) 식후 체크 및 조언</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            체크 시점
            <select
              className={inputClass}
              value={slot}
              onChange={(e) => setSlot(e.target.value as SlotType)}
            >
              <option value="T30">T30</option>
              <option value="T90">T90</option>
            </select>
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={caffeineUsed}
              onChange={(e) => setCaffeineUsed(e.target.checked)}
            />
            카페인 사용
          </label>
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            졸림 정도: {sleepiness}
            <input
              className={sliderClass}
              type="range"
              min={0}
              max={4}
              step={1}
              value={sleepiness}
              onChange={(e) => setSleepiness(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            집중 저하 정도: {focusDrop}
            <input
              className={sliderClass}
              type="range"
              min={0}
              max={4}
              step={1}
              value={focusDrop}
              onChange={(e) => setFocusDrop(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            무기력/처짐 정도: {sluggishness}
            <input
              className={sliderClass}
              type="range"
              min={0}
              max={4}
              step={1}
              value={sluggishness}
              onChange={(e) => setSluggishness(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            속 불편감(소화): {giDiscomfort}
            <input
              className={sliderClass}
              type="range"
              min={0}
              max={4}
              step={1}
              value={giDiscomfort}
              onChange={(e) => setGiDiscomfort(Number(e.target.value))}
            />
          </label>
          <label className="text-sm md:col-span-2">
            두통 정도: {headache}
            <input
              className={sliderClass}
              type="range"
              min={0}
              max={4}
              step={1}
              value={headache}
              onChange={(e) => setHeadache(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || !mealId}
          onClick={handleSubmitPostCheck}
        >
          체크 제출 + 조언 받기
        </button>
        {postCheck && (
          <div className="mt-3 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-700">포스트 체크 결과</h3>
            <DataRow label="check_id" value={postCheck.check_id} />
            <DataRow label="slot" value={postCheck.slot} />
            <DataRow label="dip_score_partial" value={postCheck.dip_score_partial} />
            <DataRow label="late" value={postCheck.late ? "true" : "false"} />
            <DataRow
              label="check_completion_time_ms"
              value={postCheck.check_completion_time_ms == null ? "-" : postCheck.check_completion_time_ms}
            />
          </div>
        )}
        {advice && (
          <div className="mt-3 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-700">조언 결과</h3>
            <DataRow label="advice_id" value={advice.advice_id} />
            <DataRow label="dip_score" value={advice.dip_score} />
            <DataRow label="decision_mode" value={advice.decision_mode} />
            <DataRow label="task_mode" value={advice.task_mode} />
            <DataRow label="confidence" value={`${Math.round(advice.confidence * 100)}%`} />
            <DataRow label="next_action" value={advice.next_action.join(", ") || "-"} />
            <DataRow label="why_tokens" value={advice.why_tokens.join(", ") || "-"} />
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-semibold text-slate-800">4) 주간 요약</h2>
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          disabled={busy}
          onClick={handleLoadWeekly}
        >
          주간 KPI 조회
        </button>
        {summary && (
          <div className="mt-3 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-700">주간 요약</h3>
            <DataRow label="week_start" value={formatDateTime(`${summary.week_start}T00:00:00Z`)} />
            <DataRow label="days_logged" value={summary.days_logged} />
            <DataRow label="avg_dip_score" value={summary.avg_dip_score} />
            <DataRow
              label="t30_response_rate"
              value={`${Math.round(summary.t30_response_rate * 100)}%`}
            />
            <DataRow
              label="advice_follow_rate"
              value={`${Math.round(summary.advice_follow_rate * 100)}%`}
            />
            <DataRow
              label="zero_input_meal_rate"
              value={`${Math.round(summary.zero_input_meal_rate * 100)}%`}
            />
          </div>
        )}
      </section>
    </main>
  );
};

export default MealCoachPage;
