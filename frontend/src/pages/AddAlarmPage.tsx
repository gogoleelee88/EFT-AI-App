import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellPlus,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudOff,
  LoaderCircle,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import AlarmInstallGuide from "../components/feature/AlarmInstallGuide";
import AlarmSettingStep from "../components/plan/AlarmSettingStep";
import MicroActionStep from "../components/plan/MicroActionStep";
import MissionSettingStep from "../components/plan/MissionSettingStep";
import TaskInputStep from "../components/plan/TaskInputStep";
import { Button } from "../components/ui/Button";
import Card from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { useInstallBootstrap } from "../hooks/useInstallBootstrap";
import { usePlanWizard, type WizardStep } from "../hooks/usePlanWizard";
import {
  createAppOnlyEvent,
  createMaskedPayload,
  loadAppOnlyEvents,
  saveAppOnlyEvent,
  savePrivacyMapping,
  type AppOnlyEvent,
} from "../services/privacySync";
import {
  clearAddAlarmDraft,
  loadAddAlarmDraft,
  saveAddAlarmDraft,
} from "../services/plannerClientStateService";
import type {
  AlarmConfig,
  MissionCombinationMode,
  MissionConfig,
  PlanItemInput,
  PlanWithMissionResponse,
  SelectedMicroAction,
  SelectedTask,
} from "../types/mission";
import type { AddAlarmDraft } from "../types/plannerClientState";
import type { PrivacyMode } from "../types/privacy";
import { PRIVACY_MODE_DESCRIPTIONS, PRIVACY_MODE_LABELS } from "../types/privacy";
import {
  buildAlarmDescription,
  formatRepeatLabel,
  parseHhmm,
  resolveAlarmWindow,
} from "./addAlarm.utils";
import { buildPlannerHref } from "../utils/plannerRoutes";

type TimelineEntry = {
  id: string;
  title: string;
  startLabel: string;
  endLabel: string;
  startMinutes: number;
  endMinutes: number;
  source: "google" | "app";
};

const STEP_META: Array<{ step: WizardStep; label: string; summary: string }> = [
  { step: 1, label: "작업", summary: "실행할 작업과 공개 범위를 먼저 정합니다." },
  { step: 2, label: "미세 행동", summary: "바로 시작할 수 있는 첫 행동을 좁혀 줍니다." },
  { step: 3, label: "미션", summary: "지속 방식과 완료 조건을 단계별로 정리합니다." },
  { step: 4, label: "알람", summary: "시간, 반복, 동기화 모드를 확정합니다." },
  { step: 5, label: "완료", summary: "저장 결과와 다음 액션을 확인합니다." },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return "없음";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const extractTimeLabel = (value: string) => {
  const match = value.match(/(\d{2}:\d{2})/);
  return match?.[1] ?? value;
};

const toMinutes = (label: string) => {
  const parsed = parseHhmm(label);
  if (!parsed) return -1;
  return parsed.hour * 60 + parsed.minute;
};

const hasDraftContent = (draft: AddAlarmDraft) =>
  Boolean(
    draft.task ||
      draft.microAction ||
      draft.missions.length > 0 ||
      draft.alarm ||
      draft.step > 1
  );

const buildPlanStartResistanceLabel = (resistanceLevel?: number) => {
  if (resistanceLevel == null) return "시작 저항 보통";
  return resistanceLevel >= 7 ? "시작 저항 높음" : "시작 저항 보통";
};

const StepPill: React.FC<{
  step: WizardStep;
  currentStep: WizardStep;
  label: string;
  onClick: (step: WizardStep) => void;
}> = ({ step, currentStep, label, onClick }) => {
  const done = step < currentStep;
  const active = step === currentStep;
  const disabled = step > currentStep;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(step)}
      className={`flex min-w-[92px] items-center gap-2 rounded-2xl border px-3 py-2 text-left transition ${
        active
          ? "border-sky-300 bg-sky-50 text-sky-800"
          : done
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-400"
      } ${disabled ? "cursor-not-allowed opacity-70" : "hover:-translate-y-0.5"}`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          active
            ? "bg-sky-600 text-white"
            : done
            ? "bg-emerald-600 text-white"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {done ? "✓" : step}
      </span>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
};

const SummaryRow: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 border-b border-dashed border-slate-200 py-3 last:border-b-0">
    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
      {label}
    </div>
    <div className="max-w-[70%] text-right text-sm font-medium text-slate-800">
      {value}
    </div>
  </div>
);

const AddAlarmPage: React.FC<{ activeDate?: string }> = ({ activeDate }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const wizard = usePlanWizard(activeDate);
  const {
    isConnected,
    googleEvents,
    lastSync,
    loading: googleLoading,
    error: googleError,
    connectGoogle,
    fetchGoogleEvents,
    exportToGoogle,
  } = useGoogleCalendar();

  const [appOnlyEvents, setAppOnlyEvents] = useState<AppOnlyEvent[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restorableDraft, setRestorableDraft] = useState<AddAlarmDraft | null>(null);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [flowNotice, setFlowNotice] = useState<string | null>(null);
  const [completedPrivacyMode, setCompletedPrivacyMode] =
    useState<PrivacyMode>("NORMAL");
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const {
    bootstrap: installBootstrap,
    loading: installBootstrapLoading,
    warning: installBootstrapWarning,
  } = useInstallBootstrap();

  const planItems: PlanItemInput[] = useMemo(() => {
    const items: PlanItemInput[] = [];
    if (wizard.state.task?.task_title) {
      items.push({ title: wizard.state.task.task_title });
    }
    googleEvents.forEach((event) => {
      if (event.title) {
        items.push({
          title: event.displayTitle ?? event.title,
          start: event.start,
          end: event.end,
        });
      }
    });
    return items;
  }, [googleEvents, wizard.state.task?.task_title]);

  const missionType = useMemo(() => {
    const enabled = wizard.state.missions.find((mission) => mission.enabled);
    return enabled?.type;
  }, [wizard.state.missions]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const googleEntries = googleEvents
      .map((event) => {
        const startLabel = extractTimeLabel(event.start);
        const endLabel = extractTimeLabel(event.end);
        return {
          id: `google-${event.id}`,
          title: event.displayTitle ?? event.title,
          startLabel,
          endLabel,
          startMinutes: toMinutes(startLabel),
          endMinutes: toMinutes(endLabel),
          source: "google" as const,
        };
      })
      .filter((entry) => entry.startMinutes >= 0 && entry.endMinutes >= 0);

    const appEntries = appOnlyEvents
      .map((event) => {
        const startLabel = extractTimeLabel(event.startIso);
        const endLabel = extractTimeLabel(event.endIso);
        return {
          id: `app-${event.id}`,
          title: event.title,
          startLabel,
          endLabel,
          startMinutes: toMinutes(startLabel),
          endMinutes: toMinutes(endLabel),
          source: "app" as const,
        };
      })
      .filter((entry) => entry.startMinutes >= 0 && entry.endMinutes >= 0);

    return [...googleEntries, ...appEntries].sort(
      (left, right) => left.startMinutes - right.startMinutes
    );
  }, [appOnlyEvents, googleEvents]);

  const selectedWindow = useMemo(() => {
    if (!wizard.state.task || !wizard.state.alarm) return null;
    return resolveAlarmWindow(
      wizard.state.date,
      wizard.state.alarm,
      wizard.state.task.est_minutes || 30
    );
  }, [wizard.state.alarm, wizard.state.date, wizard.state.task]);

  const scheduleConflicts = useMemo(() => {
    if (!selectedWindow || wizard.state.alarm?.ends_next_day) return [];
    const startMinutes = toMinutes(selectedWindow.startLabel);
    const endMinutes = toMinutes(selectedWindow.endLabel);
    if (startMinutes < 0 || endMinutes < 0) return [];
    return timelineEntries.filter(
      (entry) => entry.startMinutes < endMinutes && entry.endMinutes > startMinutes
    );
  }, [selectedWindow, timelineEntries, wizard.state.alarm?.ends_next_day]);

  const applyDraft = (draft: AddAlarmDraft) => {
    flushSync(() => {
      wizard.setDate(draft.date);
      wizard.setMode(draft.mode);
      if (draft.task) wizard.setTask(draft.task);
      if (draft.microAction) wizard.setMicroAction(draft.microAction);
      wizard.setMissions(draft.missions || []);
      wizard.setMissionCombinationMode(draft.missionCombinationMode || "basic");
      if (draft.alarm) wizard.setAlarm(draft.alarm);
      wizard.setPrivacyMode(draft.privacyMode || "NORMAL");
      wizard.goToStep(draft.step || 1);
    });
  };

  const syncReservation = async (
    privacyMode: PrivacyMode,
    savedPlan: PlanWithMissionResponse,
    alarmOverride?: AlarmConfig
  ) => {
    if (!user?.uid) {
      throw new Error("planner_client_state_requires_user");
    }
    const task = wizard.state.task;
    const microAction = wizard.state.microAction;
    const alarm = alarmOverride ?? wizard.state.alarm;
    if (!task || !alarm) {
      return "작업과 알람 정보가 모두 있어야 일정을 저장할 수 있습니다.";
    }

    const resolvedWindow = resolveAlarmWindow(
      wizard.state.date,
      alarm,
      task.est_minutes || 30
    );
    if (!resolvedWindow) {
      throw new Error("알람 시간 범위를 계산하지 못했습니다.");
    }

    const taskId = task.task_id || savedPlan.items?.[0]?.task_id;
    const originalTitle = task.task_title;
    const originalDescription = buildAlarmDescription(microAction, wizard.state.missions);

    if (privacyMode === "APP_ONLY") {
      const appOnlyEvent = createAppOnlyEvent({
        title: originalTitle,
        description: originalDescription,
        startIso: resolvedWindow.startIso,
        endIso: resolvedWindow.endIso,
      });
      await saveAppOnlyEvent(user.uid, appOnlyEvent);
      setAppOnlyEvents(await loadAppOnlyEvents(user.uid, wizard.state.date));
      return "앱 전용 일정으로 저장했습니다.";
    }

    if (!taskId) {
      throw new Error("Google Calendar 동기화용 task_id를 찾지 못했습니다.");
    }

    if (privacyMode === "MASKED") {
      const { maskedTitle, maskedDescription, privacyKey } = createMaskedPayload(
        resolvedWindow.startLabel,
        resolvedWindow.endLabel
      );
      await savePrivacyMapping(user.uid, {
        key: privacyKey,
        originalTitle,
        originalDescription,
        maskedTitle,
        maskedDescription,
        privacy_mode: "MASKED",
        updatedAt: new Date().toISOString(),
      });
      await exportToGoogle({
        taskId,
        startIso: resolvedWindow.startIso,
        durationMinutes: resolvedWindow.durationMinutes,
        summary: maskedTitle,
        description: maskedDescription,
        privacyMode,
        privacyKey,
        originalTitle,
        originalDescription,
      });
      await fetchGoogleEvents(wizard.state.date);
      return "Google Calendar에 마스킹 일정으로 동기화했습니다.";
    }

    await exportToGoogle({
      taskId,
      startIso: resolvedWindow.startIso,
      durationMinutes: resolvedWindow.durationMinutes,
      summary: originalTitle,
      description: originalDescription,
      privacyMode,
      originalTitle,
      originalDescription,
    });
    await fetchGoogleEvents(wizard.state.date);
    return "Google Calendar에 일정을 추가했습니다.";
  };

  useEffect(() => {
    if (!user?.uid) {
      setIsDraftReady(false);
      setRestorableDraft(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const draft = await loadAddAlarmDraft<AddAlarmDraft>(user.uid);
      if (cancelled) return;
      setRestorableDraft(draft && hasDraftContent(draft) ? draft : null);
      setIsDraftReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (isConnected && wizard.state.date) {
      void fetchGoogleEvents(wizard.state.date);
    }
  }, [fetchGoogleEvents, isConnected, wizard.state.date]);

  useEffect(() => {
    if (!user?.uid) {
      setAppOnlyEvents([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const events = await loadAppOnlyEvents(user.uid, wizard.state.date);
      if (!cancelled) {
        setAppOnlyEvents(events);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, wizard.state.date]);

  useEffect(() => {
    if (!user?.uid || !isDraftReady) return;

    if (wizard.state.step === 5) {
      void clearAddAlarmDraft(user.uid);
      setDraftSavedAt(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const draft: AddAlarmDraft = {
        date: wizard.state.date,
        mode: wizard.state.mode,
        step: wizard.state.step,
        task: wizard.state.task,
        microAction: wizard.state.microAction,
        missions: wizard.state.missions,
        missionCombinationMode: wizard.state.missionCombinationMode,
        alarm: wizard.state.alarm,
        privacyMode: wizard.state.privacy_mode,
        updatedAt: new Date().toISOString(),
      };

      if (!hasDraftContent(draft)) {
        void clearAddAlarmDraft(user.uid);
        setDraftSavedAt(null);
        return;
      }

      void saveAddAlarmDraft(user.uid, draft).then(() => {
        setDraftSavedAt(draft.updatedAt);
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    isDraftReady,
    user?.uid,
    wizard.state.alarm,
    wizard.state.date,
    wizard.state.microAction,
    wizard.state.missionCombinationMode,
    wizard.state.missions,
    wizard.state.mode,
    wizard.state.privacy_mode,
    wizard.state.step,
    wizard.state.task,
  ]);

  const handleTaskNext = (task: SelectedTask) => {
    setFlowError(null);
    setFlowNotice(null);
    wizard.setTask(task);
    wizard.nextStep();
  };

  const handleMicroActionNext = (microAction: SelectedMicroAction) => {
    setFlowError(null);
    setFlowNotice(null);
    wizard.setMicroAction(microAction);
    wizard.nextStep();
  };

  const handleMissionNext = (
    missions: MissionConfig[],
    combinationMode: MissionCombinationMode
  ) => {
    setFlowError(null);
    setFlowNotice(null);
    wizard.setMissions(missions);
    wizard.setMissionCombinationMode(combinationMode);
    wizard.nextStep();
  };

  const handleAlarmComplete = async (
    alarm: AlarmConfig,
    options: { syncMode: PrivacyMode }
  ) => {
    if (!user?.uid) {
      throw new Error("로그인이 필요합니다.");
    }

    setFlowError(null);
    setFlowNotice(null);
    setCompletedPrivacyMode(options.syncMode);

    flushSync(() => {
      wizard.setAlarm(alarm);
      wizard.setPrivacyMode(options.syncMode);
    });

    const savedPlan = await wizard.submit(user.uid, { alarm });

    if (user.uid) {
      await clearAddAlarmDraft(user.uid);
      setDraftSavedAt(null);
      setRestorableDraft(null);
    }

    try {
      const notice = await syncReservation(options.syncMode, savedPlan, alarm);
      setFlowNotice(notice);
    } catch (error) {
      setFlowError(
        error instanceof Error
          ? error.message
          : "일정 동기화 중 오류가 발생했습니다."
      );
    }

    setShowInstallGuide(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <LoaderCircle className="h-5 w-5 animate-spin text-sky-600" />
            <span className="text-sm font-medium text-slate-700">
              알람 플로우를 준비하고 있습니다.
            </span>
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
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-slate-900">
              로그인 후 알람을 만들 수 있습니다
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              저장된 일정과 미션 연동을 위해 계정 인증이 필요합니다.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="mt-6"
              onClick={() => navigate("/login")}
            >
              로그인
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_26%),linear-gradient(180deg,_#f9fcff_0%,_#f4f9ff_44%,_#f8fafc_100%)] pb-28">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
          <Card className="rounded-[32px] border-slate-200 bg-white/90 p-6 backdrop-blur">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  <BellPlus className="h-3.5 w-3.5" />
                  Production Alarm Builder
                </span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    Add Alarm
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    작업, 미세 행동, 검증 미션, 동기화 정책을 분리해서 단계별로
                    설정하는 실행 전용 페이지입니다.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Sync
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {isConnected ? "Google 연결됨" : "앱 전용 저장"}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Date
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {wizard.state.date}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Draft
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {draftSavedAt ? "자동 저장됨" : "초안 없음"}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={() => navigate("/my-page")}
              className="rounded-[28px] border border-slate-200 bg-white/85 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-900">
                마이페이지 가기
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                목표와 강점 정보를 먼저 정리하면 알람 제안 정확도가 더 좋아집니다.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/signal-inbox")}
              className="rounded-[28px] border border-slate-200 bg-white/85 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-900">
                신호함에서 데이터 보기
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                저장한 신호, 반복 로그, 행동 질문을 한곳에서 확인할 수 있습니다.
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(buildPlannerHref("deadline", { baseSearchParams: searchParams }), {
                  state: {
                    draftTitle: wizard.state.task?.task_title,
                    draftDate: wizard.state.date,
                    draftStartTime:
                      wizard.state.alarm?.start_time || wizard.state.alarm?.time,
                    draftEndTime: wizard.state.alarm?.end_time,
                  },
                })
              }
              className="rounded-[28px] border border-slate-200 bg-white/85 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
                  <BellPlus className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-900">
                마감 플랜 만들기
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                마감일과 가용 시간을 기준으로 오늘 체크리스트와 주간 계획을 함께 관리합니다.
              </div>
            </button>
          </div>
        </div>

        {restorableDraft && (
          <div className="mt-4 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">복원 가능한 알람 초안이 있습니다.</div>
                <div className="mt-1 text-xs text-amber-700">
                  마지막 수정 시각 {formatDateTime(restorableDraft.updatedAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRestorableDraft(null)}>
                  臾댁떆
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    applyDraft(restorableDraft);
                    setDraftSavedAt(restorableDraft.updatedAt);
                    setRestorableDraft(null);
                    setFlowNotice("저장된 초안을 복원했습니다.");
                    setFlowError(null);
                  }}
                >
                  초안 복원
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white/85 shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5">
              <div className="flex flex-wrap gap-2">
                {STEP_META.map((item) => (
                  <StepPill
                    key={item.step}
                    step={item.step}
                    currentStep={wizard.state.step}
                    label={item.label}
                    onClick={(step) => wizard.goToStep(step)}
                  />
                ))}
              </div>
              <div className="mt-4">
                <div className="text-lg font-semibold text-slate-950">
                  {STEP_META[wizard.state.step - 1]?.label}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {STEP_META[wizard.state.step - 1]?.summary}
                </div>
              </div>
            </div>

            {wizard.state.step === 1 && (
              <TaskInputStep
                initialTask={wizard.state.task}
                onNext={handleTaskNext}
                userId={user.uid}
                privacyMode={wizard.state.privacy_mode}
                onPrivacyModeChange={wizard.setPrivacyMode}
              />
            )}

            {wizard.state.step === 2 && wizard.state.task && (
              <MicroActionStep
                task={wizard.state.task}
                initialMicroAction={wizard.state.microAction}
                onNext={handleMicroActionNext}
                onBack={wizard.prevStep}
                onTaskUpdate={wizard.setTask}
                userId={user.uid}
                planItems={planItems}
                missionType={missionType}
              />
            )}

            {wizard.state.step === 3 &&
              wizard.state.task &&
              wizard.state.microAction && (
                <MissionSettingStep
                  task={wizard.state.task}
                  microAction={wizard.state.microAction}
                  initialMissions={wizard.state.missions}
                  onNext={handleMissionNext}
                  onBack={wizard.prevStep}
                  userId={user.uid}
                />
              )}

            {wizard.state.step === 4 &&
              wizard.state.task &&
              wizard.state.microAction && (
                <AlarmSettingStep
                  task={wizard.state.task}
                  microAction={wizard.state.microAction}
                  missions={wizard.state.missions}
                  initialAlarm={wizard.state.alarm}
                  onComplete={handleAlarmComplete}
                  onBack={wizard.prevStep}
                  userId={user.uid}
                  isGoogleConnected={isConnected}
                  privacyMode={wizard.state.privacy_mode}
                />
              )}

            {wizard.state.step === 5 && wizard.state.task && wizard.state.alarm && (
              <div className="space-y-4 p-5">
                <Card className="rounded-[28px] border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-lg font-semibold text-emerald-900">
                        알람이 저장되었습니다
                      </div>
                      <div className="text-sm leading-6 text-emerald-800">
                        {flowNotice ||
                          "저장 후 동기화 상태를 확인했습니다. 아래 요약에서 다음 작업을 이어가세요."}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[28px] border-slate-200 p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <SummaryRow label="작업" value={wizard.state.task.task_title} />
                    <SummaryRow
                      label="반복"
                      value={formatRepeatLabel(
                        wizard.state.alarm.repeat,
                        wizard.state.alarm.custom_days
                      )}
                    />
                    <SummaryRow
                      label="알람 시간"
                      value={`${wizard.state.alarm.start_time} - ${wizard.state.alarm.end_time}`}
                    />
                    <SummaryRow
                      label="동기화 정책"
                      value={PRIVACY_MODE_LABELS[completedPrivacyMode]}
                    />
                    <SummaryRow
                      label="미세 행동"
                      value={wizard.state.microAction?.name || "없음"}
                    />
                    <SummaryRow
                      label="미션 수"
                      value={`${wizard.state.missions.filter((mission) => mission.enabled).length}개`}
                    />
                  </div>
                </Card>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      wizard.reset();
                      setFlowError(null);
                      setFlowNotice(null);
                      setShowInstallGuide(false);
                      setCompletedPrivacyMode("NORMAL");
                    }}
                  >
                    새 알람 만들기
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() =>
                      navigate("/eft-strict", {
                        state: {
                          planStartResistance: buildPlanStartResistanceLabel(
                            wizard.state.task?.resistance_level
                          ),
                        },
                      })
                    }
                  >
                    상태 기록하기
                  </Button>
                  <Button variant="primary" size="md" onClick={() => navigate("/my-page")}>
                    마이페이지로 이동
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    실행 요약
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    현재 선택한 정보와 동기화 상태를 실시간으로 확인합니다.
                  </p>
                </div>
                {!isConnected ? (
                  <Button variant="outline" size="sm" onClick={connectGoogle}>
                    Google 연결
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    연결됨
                  </span>
                )}
              </div>

              <div className="mt-5">
                <SummaryRow label="선택 날짜" value={wizard.state.date} />
                <SummaryRow label="모드" value={`${wizard.state.mode}%`} />
                <SummaryRow
                  label="개인정보 보호"
                  value={PRIVACY_MODE_LABELS[wizard.state.privacy_mode]}
                />
                <SummaryRow
                  label="작업"
                  value={wizard.state.task?.task_title || "아직 선택하지 않음"}
                />
                <SummaryRow
                  label="미세 행동"
                  value={wizard.state.microAction?.name || "아직 선택하지 않음"}
                />
                <SummaryRow
                  label="알람"
                  value={
                    wizard.state.alarm
                      ? `${wizard.state.alarm.start_time} - ${wizard.state.alarm.end_time}`
                      : "아직 설정하지 않음"
                  }
                />
              </div>

              {selectedWindow && (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                  <div className="font-semibold">예상 실행 블록</div>
                  <div className="mt-1">
                    {selectedWindow.startLabel} - {selectedWindow.endLabel}
                    {wizard.state.alarm?.ends_next_day ? " (익일 종료)" : ""}
                  </div>
                  <div className="mt-2 text-xs text-sky-700">
                    {PRIVACY_MODE_DESCRIPTIONS[wizard.state.privacy_mode]}
                  </div>
                </div>
              )}

              {flowError && (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {flowError}
                </div>
              )}

              {googleError && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  {googleError}
                </div>
              )}
            </Card>

            <Card className="rounded-[32px] border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    일정 타임라인
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    같은 날짜의 Google 일정과 앱 전용 일정을 함께 봅니다.
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  {googleLoading
                    ? "동기화 중"
                    : lastSync
                    ? `최근 동기화 ${formatDateTime(lastSync.toISOString())}`
                    : "아직 동기화 없음"}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {timelineEntries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    표시할 일정이 없습니다.
                  </div>
                )}

                {timelineEntries.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {entry.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {entry.startLabel} - {entry.endLabel}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          entry.source === "google"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {entry.source === "google" ? "Google" : "App"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {scheduleConflicts.length > 0 && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    시간 충돌 가능성
                  </div>
                  <div className="mt-2 text-xs leading-5 text-amber-800">
                    현재 알람 시간대가 아래 일정과 겹칠 수 있습니다:{" "}
                    {scheduleConflicts.map((entry) => entry.title).join(", ")}
                  </div>
                </div>
              )}
            </Card>

            {(showInstallGuide || completedPrivacyMode === "APP_ONLY") &&
              (installBootstrapLoading || installBootstrap) && (
              <div className="space-y-3">
                <AlarmInstallGuide
                  title="앱 전용 알람은 모바일에서 더 안정적입니다"
                  description="앱 전용 모드는 브라우저보다 기기 알림에 더 안정적으로 동작합니다. 필요하면 지금 설치 링크를 사용해 주세요."
                  bootstrap={installBootstrap}
                  loading={installBootstrapLoading}
                  warning={installBootstrapWarning}
                  className="rounded-[32px]"
                />
              </div>
            )}

            <Card className="rounded-[32px] border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-950">운영 메모</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <p className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                  초안은 자동 저장되며 저장 완료 이후에는 로컬 초안을 비웁니다.
                </p>
                <p className="flex items-start gap-2">
                  {isConnected ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                  ) : (
                    <CloudOff className="mt-0.5 h-4 w-4 text-slate-400" />
                  )}
                  Google 연결이 없어도 `앱 전용` 모드로 로컬 일정을 관리할 수 있습니다.
                </p>
                <p className="flex items-start gap-2">
                  <Smartphone className="mt-0.5 h-4 w-4 text-slate-400" />
                  모바일에서 앱이 설치되어 있으면 앱 전용 알람 전달 안정성이 더 높습니다.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddAlarmPage;
