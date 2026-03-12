import React, { useEffect, useMemo, useState } from "react";
import {
  AlarmClockCheck,
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Egg,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import Card from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { useDeadlineGoals } from "../hooks/useDeadlineGoals";
import type { DeadlineGoalDraft, DeadlineGoalPlan } from "../types/deadlinePlanner";
import {
  buildGoalSummary,
  buildSuggestedChecklist,
  createDeadlineGoalPlan,
  getGoalAgendaForDate,
  toChecklistEditorText,
} from "../utils/deadlinePlanner";
import { todayInKoreaIso } from "../utils/koreaTime";

type PlannerLocationState = {
  draftTitle?: string;
  draftDate?: string;
  draftStartTime?: string;
  draftEndTime?: string;
};

const plannerInputClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100";

const buildEmptyDraft = (state?: PlannerLocationState): DeadlineGoalDraft => ({
  title: state?.draftTitle || "",
  startDate: state?.draftDate || todayInKoreaIso(),
  deadlineDate: state?.draftDate || todayInKoreaIso(),
  windowStartTime: state?.draftStartTime || "19:00",
  windowEndTime: state?.draftEndTime || "20:30",
  endsNextDay: false,
  repeat: "daily",
  customDays: [],
  totalMinutes: 180,
  checklistText: "",
});

const PlannerField: React.FC<{
  label: string;
  description: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <label className="space-y-2">
    <div className="text-sm font-semibold text-slate-900">{label}</div>
    <div className="text-xs leading-5 text-slate-500">{description}</div>
    {children}
  </label>
);

const PlannerBadge: React.FC<{
  label: string;
  tone?: "sky" | "amber" | "emerald";
}> = ({ label, tone = "sky" }) => {
  const toneClassName =
    tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-sky-100 text-sky-700";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClassName}`}>
      {label}
    </span>
  );
};

const GoalCard: React.FC<{
  plan: DeadlineGoalPlan;
  onEdit: (plan: DeadlineGoalPlan) => void;
  onDelete: (planId: string) => void;
  onToggle: (planId: string, itemId: string) => void;
  onPullForward: (planId: string) => void;
}> = ({ plan, onEdit, onDelete, onToggle, onPullForward }) => {
  const todayIso = todayInKoreaIso();
  const summary = buildGoalSummary(plan, todayIso);
  const agenda = getGoalAgendaForDate(plan, todayIso);
  const completedTodayItems = (plan.assignments[todayIso] || [])
    .filter((itemId) => Boolean(plan.completionLog[itemId]))
    .map((itemId) => plan.items.find((item) => item.id === itemId))
    .filter((item): item is DeadlineGoalPlan["items"][number] => Boolean(item));
  const hasPullForwardAction =
    agenda.allVisibleDone &&
    agenda.remainingCapacityMinutes > 0 &&
    agenda.nextItems.length > 0;

  return (
    <Card className="rounded-[28px] border-slate-200 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PlannerBadge label={summary.dDay >= 0 ? `D-${summary.dDay}` : `D+${Math.abs(summary.dDay)}`} />
            <PlannerBadge label={`${summary.completionRate}% 달성`} tone="emerald" />
            {summary.driftMessage && <PlannerBadge label="부화 확률 주의" tone="amber" />}
          </div>
          <div>
            <div className="text-xl font-semibold text-slate-950">{plan.title}</div>
            <div className="mt-1 text-sm text-slate-500">
              {plan.startDate} ~ {plan.deadlineDate} · {plan.windowStartTime} - {plan.windowEndTime}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
              <div className="text-[11px] uppercase tracking-[0.14em] text-sky-200">Goal Egg</div>
              <div className="mt-2 text-2xl font-semibold">{summary.hatchProbability}%</div>
              <div className="mt-1 text-xs text-slate-300">{summary.hatchStage}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">오늘 미완료</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{agenda.pendingItems.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">전체 체크</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {summary.completedCount}/{summary.totalCount}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(plan)}>
            <span className="inline-flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              수정
            </span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(plan.id)}>
            <span className="inline-flex items-center gap-2 text-rose-600">
              <Trash2 className="h-4 w-4" />
              삭제
            </span>
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {agenda.pendingItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            오늘 분량을 모두 체크했습니다.
          </div>
        ) : (
          agenda.pendingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(plan.id, item.id)}
              className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50"
            >
              <div
                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                  item.lane === "overdue"
                    ? "border-amber-400 bg-amber-50 text-amber-600"
                    : "border-sky-300 bg-sky-50 text-sky-600"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.estMinutes}분 · {item.lane === "overdue" ? "전날에서 이월됨" : "오늘 분량"}
                </div>
              </div>
            </button>
          ))
        )}

        {completedTodayItems.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              오늘 완료
            </div>
            {completedTodayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(plan.id, item.id)}
                className="flex w-full items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition hover:bg-emerald-100"
              >
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-emerald-900 line-through">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-emerald-700">
                    다시 눌러 미완료로 되돌릴 수 있습니다.
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasPullForwardAction && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-900">시간이 남아 있습니다.</div>
              <div className="mt-1 text-xs text-emerald-700">
                내일 분량 {agenda.nextItems.length}개 중 일부를 지금 당겨올 수 있습니다.
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => onPullForward(plan.id)}>
              내일 분량 당겨오기
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

const DeadlinePlannerPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { plans, summaries, requestNotificationPermission, saveGoal, toggleItem, pullForward, removeGoal } =
    useDeadlineGoals(user?.uid);

  const state = (location.state as PlannerLocationState | null) || null;
  const [draft, setDraft] = useState<DeadlineGoalDraft>(() => buildEmptyDraft(state || undefined));
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setDraft((prev) => ({
      ...prev,
      title: state.draftTitle || prev.title,
      startDate: state.draftDate || prev.startDate,
      deadlineDate: state.draftDate || prev.deadlineDate,
      windowStartTime: state.draftStartTime || prev.windowStartTime,
      windowEndTime: state.draftEndTime || prev.windowEndTime,
    }));
  }, [state]);

  const editingPlan = useMemo(
    () => plans.find((plan) => plan.id === editingPlanId) || null,
    [editingPlanId, plans]
  );
  const previewPlan = useMemo(
    () => createDeadlineGoalPlan(draft, { existingPlan: editingPlan }),
    [draft, editingPlan]
  );

  const updateDraft = <K extends keyof DeadlineGoalDraft>(key: K, value: DeadlineGoalDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaveNotice(null);
  };

  const applySuggestedChecklist = () => {
    const suggested = buildSuggestedChecklist(draft.title, draft.totalMinutes)
      .map((item) => `${item.title} | ${item.estMinutes}`)
      .join("\n");
    updateDraft("checklistText", suggested);
  };

  const resetDraft = () => {
    setDraft(buildEmptyDraft());
    setEditingPlanId(null);
    setSaveNotice(null);
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    if (draft.title.trim().length < 2) {
      setSaveNotice("마감 제목을 2자 이상 입력해 주세요.");
      return;
    }
    if (draft.deadlineDate < draft.startDate) {
      setSaveNotice("마감일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    const savedPlan = saveGoal(draft, editingPlan);
    if (!savedPlan) return;
    setSaveNotice(editingPlan ? "체크리스트를 갱신했습니다." : "마감 플랜을 저장했습니다.");
    setEditingPlanId(null);
    setDraft(buildEmptyDraft());
    await requestNotificationPermission();
  };

  const handleEdit = (plan: DeadlineGoalPlan) => {
    setEditingPlanId(plan.id);
    setDraft({
      title: plan.title,
      startDate: plan.startDate,
      deadlineDate: plan.deadlineDate,
      windowStartTime: plan.windowStartTime,
      windowEndTime: plan.windowEndTime,
      endsNextDay: plan.endsNextDay,
      repeat: plan.repeat,
      customDays: [...plan.customDays],
      totalMinutes: plan.totalMinutes,
      checklistText: toChecklistEditorText(plan),
    });
    setSaveNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (planId: string) => {
    if (!window.confirm("이 마감 플랜을 삭제할까요?")) return;
    removeGoal(planId);
    if (editingPlanId === planId) {
      resetDraft();
    }
  };

  const handlePullForward = (planId: string) => {
    if (!window.confirm("남는 시간에 내일 분량을 앞으로 당길까요?")) return;
    pullForward(planId);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <LoaderCircle className="h-5 w-5 animate-spin text-sky-600" />
            <span className="text-sm font-medium text-slate-700">마감 플래너를 불러오는 중입니다.</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6">
          <Card className="w-full rounded-[28px] border-slate-200 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <CalendarClock className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-slate-900">로그인이 필요합니다.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              마감 플랜, 체크리스트, 부화 확률을 저장하려면 먼저 로그인해 주세요.
            </p>
            <Button variant="primary" size="lg" className="mt-6" onClick={() => navigate("/login")}>
              로그인
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_#f6fbff_0%,_#eef6ff_42%,_#f8fafc_100%)] pb-28">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
          <Card className="rounded-[32px] border-slate-200 bg-white/90 p-6 backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Hatch Deadline Planner
                </span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">마감 플래너</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    마감 제목과 일일 사용 가능 시간을 기준으로 체크리스트를 나누고, 못한 일은 다음 날로 이월하고,
                    시간이 남으면 내일 분량을 당겨옵니다. 오늘 할 일은 헤더와 마이페이지에 바로 반영됩니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PlannerBadge label={`${plans.length}개 목표`} />
                  <PlannerBadge label={`${summaries.filter((item) => item.driftMessage).length}개 주의`} tone="amber" />
                  <PlannerBadge label={`${summaries.filter((item) => item.completionRate >= 100).length}개 완료`} tone="emerald" />
                </div>
              </div>

              <div className="min-w-[220px] rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-lg">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">
                  Today Snapshot
                </div>
                <div className="mt-3 text-3xl font-semibold">
                  {summaries.length > 0
                    ? `${Math.round(
                        summaries.reduce((sum, item) => sum + item.hatchProbability, 0) /
                          summaries.length
                      )}%`
                    : "0%"}
                </div>
                <div className="mt-2 text-sm text-slate-300">활성 목표 평균 부화 확률</div>
                <button
                  type="button"
                  onClick={async () => {
                    await requestNotificationPermission();
                    setSaveNotice("브라우저 알림 권한을 확인했습니다.");
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  <BellRing className="h-4 w-4" />
                  알림 권한 확인
                </button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={() => navigate("/add-alarm")}
              className="rounded-[28px] border border-slate-200 bg-white/85 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <AlarmClockCheck className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-900">알람 페이지 열기</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                시간 블록 알람과 연동되는 일반 일정 설정이 필요하면 여기서 이어서 처리합니다.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/my-page")}
              className="rounded-[28px] border border-slate-200 bg-white/85 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <Egg className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-900">마이페이지로 보기</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                목표 알, 디데이, 달성률, 부화 확률 요약을 마이페이지에서도 확인할 수 있습니다.
              </div>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <Card className="rounded-[32px] border-slate-200 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  {editingPlan ? "체크리스트 수정" : "새 마감 플랜"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  자동 초안을 만든 뒤 직접 수정하거나, 처음부터 체크리스트를 직접 입력할 수 있습니다.
                </p>
              </div>
              {editingPlan && (
                <Button variant="ghost" size="sm" onClick={resetDraft}>
                  새로 작성
                </Button>
              )}
            </div>

            <div className="mt-6 grid gap-5">
              <PlannerField
                label="마감 제목"
                description="헤더와 마이페이지, 오늘 체크리스트의 헤드라인으로 노출됩니다."
              >
                <input
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="예: 투자제안서 제출, 앱 QA 마감, 시험 범위 1차 완주"
                  className={plannerInputClassName}
                />
              </PlannerField>

              <div className="grid gap-5 md:grid-cols-2">
                <PlannerField
                  label="시작일"
                  description="오늘부터 시작할지, 며칠 뒤부터 분배할지 정합니다."
                >
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) => updateDraft("startDate", event.target.value)}
                    className={plannerInputClassName}
                  />
                </PlannerField>

                <PlannerField
                  label="마감일"
                  description="디데이와 남은 분량 계산의 기준이 됩니다."
                >
                  <input
                    type="date"
                    value={draft.deadlineDate}
                    onChange={(event) => updateDraft("deadlineDate", event.target.value)}
                    className={plannerInputClassName}
                  />
                </PlannerField>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                <PlannerField
                  label="시작 시간"
                  description="하루에 이 목표를 시작할 수 있는 시각입니다."
                >
                  <input
                    type="time"
                    value={draft.windowStartTime}
                    onChange={(event) => updateDraft("windowStartTime", event.target.value)}
                    className={plannerInputClassName}
                  />
                </PlannerField>

                <PlannerField
                  label="끝낼 시간"
                  description="이 시각까지 가능한 분량으로 일일 목표량을 계산합니다."
                >
                  <input
                    type="time"
                    value={draft.windowEndTime}
                    onChange={(event) => updateDraft("windowEndTime", event.target.value)}
                    className={plannerInputClassName}
                  />
                </PlannerField>

                <PlannerField
                  label="총 예상 분"
                  description="자동 체크리스트 생성과 일일 분배의 기준이 되는 총량입니다."
                >
                  <input
                    type="number"
                    min={30}
                    step={15}
                    value={draft.totalMinutes}
                    onChange={(event) => updateDraft("totalMinutes", Number(event.target.value) || 0)}
                    className={plannerInputClassName}
                  />
                </PlannerField>
              </div>

              <PlannerField
                label="체크리스트"
                description="한 줄에 한 업무씩 입력하세요. `작업명 | 30`처럼 분 단위를 붙이면 더 정확하게 나뉩니다."
              >
                <textarea
                  rows={10}
                  value={draft.checklistText}
                  onChange={(event) => updateDraft("checklistText", event.target.value)}
                  placeholder={"자료 조사 | 45\n핵심 슬라이드 초안 | 60\n최종 검토 | 30"}
                  className={`${plannerInputClassName} resize-none`}
                />
              </PlannerField>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="md" onClick={applySuggestedChecklist}>
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    자동 초안 채우기
                  </span>
                </Button>
                <Button variant="ghost" size="md" onClick={resetDraft}>
                  초기화
                </Button>
              </div>

              {saveNotice && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  {saveNotice}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="lg" onClick={handleSave}>
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    {editingPlan ? "수정 저장" : "마감 플랜 저장"}
                  </span>
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">일일 분배 미리보기</h2>
                  <p className="text-sm text-slate-500">
                    저장 전에 날짜별 체크리스트와 일일 용량을 확인합니다.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {Object.entries(previewPlan.assignments).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    날짜와 마감일을 입력하면 일일 분배를 보여줍니다.
                  </div>
                ) : (
                  Object.entries(previewPlan.assignments).map(([dateIso, itemIds]) => {
                    const previewItems = itemIds
                      .map((itemId) => previewPlan.items.find((item) => item.id === itemId))
                      .filter((item): item is DeadlineGoalPlan["items"][number] => Boolean(item));
                    const plannedMinutes = previewItems.reduce(
                      (sum, item) => sum + item.estMinutes,
                      0
                    );
                    return (
                      <div
                        key={dateIso}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">{dateIso}</div>
                          <div className="text-xs text-slate-500">{plannedMinutes}분</div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {previewItems.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            >
                              {item.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Egg className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">활성 목표</h2>
                  <p className="text-sm text-slate-500">
                    오늘 체크리스트와 부화 확률을 바로 관리할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {plans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    아직 저장한 마감 플랜이 없습니다.
                  </div>
                ) : (
                  plans.map((plan) => (
                    <GoalCard
                      key={plan.id}
                      plan={plan}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggle={toggleItem}
                      onPullForward={handlePullForward}
                    />
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeadlinePlannerPage;
