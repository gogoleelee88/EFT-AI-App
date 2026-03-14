import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, Clock3, Crosshair, ListTodo } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AddAlarmPage from "./AddAlarmPage";
import DeadlinePlannerPage from "./DeadlinePlannerPage";
import PlanDayPage from "./PlanDayPage";
import {
  fetchPlannerWorkspace,
  type PlannerAlarmPolicy,
  type PlannerDailyAssignment,
  type PlannerExecutionState,
  type PlannerGoalItem,
  type PlannerWorkspaceResponse,
} from "../services/plannerWorkspaceService";
import {
  buildPlannerHref,
  normalizePlannerActiveDate,
  normalizePlannerTab,
  type PlannerTab,
} from "../utils/plannerRoutes";

const TABS: Array<{
  id: PlannerTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "deadline",
    label: "마감",
    description: "마감 목표를 만들고 목표를 쪼개서 오늘 분량까지 이어서 관리합니다.",
    icon: ListTodo,
  },
  {
    id: "today",
    label: "오늘",
    description: "오늘 배정과 실행 흐름을 같은 planner 안에서 조정합니다.",
    icon: CalendarClock,
  },
  {
    id: "alarm",
    label: "알람",
    description: "오늘 일정과 연결된 알람 정책을 한 화면에서 맞춥니다.",
    icon: Clock3,
  },
];

type PlannerFocusMatch = {
  taskUid: string;
  title: string;
  plannedMinutes: number | null;
  status: string | null;
  assignment: PlannerDailyAssignment | null;
  alarmPolicy: PlannerAlarmPolicy | null;
  executionState: PlannerExecutionState | null;
};

const formatFocusStatus = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) return "Unknown";
  return normalized
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
};

const formatAlarmWindow = (policy: PlannerAlarmPolicy | null) => {
  if (!policy?.start_time) return "No alarm window";
  if (!policy.end_time) return `${policy.start_time} start`;
  return policy.ends_next_day
    ? `${policy.start_time} - ${policy.end_time} (+1d)`
    : `${policy.start_time} - ${policy.end_time}`;
};

const PlannerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const activeDate = normalizePlannerActiveDate(searchParams.get("active_date"));
  const activeTab = normalizePlannerTab(searchParams.get("tab"));
  const focusedTaskUid = searchParams.get("task_uid")?.trim() || null;
  const focusSource = searchParams.get("source")?.trim() || null;
  const [workspace, setWorkspace] = useState<PlannerWorkspaceResponse | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    void fetchPlannerWorkspace(activeDate)
      .then((nextWorkspace) => {
        if (cancelled) return;
        setWorkspace(nextWorkspace);
      })
      .catch((error) => {
        if (cancelled) return;
        setWorkspaceError(
          error instanceof Error ? error.message : "Planner workspace sync failed."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDate]);

  const handleTabChange = (nextTab: PlannerTab) => {
    if (nextTab === activeTab) return;
    navigate(
      buildPlannerHref(nextTab, {
        baseSearchParams: searchParams,
        activeDate,
      }),
      {
        state: location.state,
      }
    );
  };

  const snapshotCards = useMemo(
    () => [
      {
        label: "Goal items",
        value: workspace?.goal_items.length ?? 0,
      },
      {
        label: "Today assignments",
        value: workspace?.daily_assignments.length ?? 0,
      },
      {
        label: "Alarm policies",
        value: workspace?.alarm_policies.length ?? 0,
      },
      {
        label: "Version",
        value: workspace?.version ?? 0,
      },
    ],
    [workspace]
  );

  const focusMatch = useMemo<PlannerFocusMatch | null>(() => {
    if (!workspace || !focusedTaskUid) return null;

    const goalItem =
      workspace.goal_items.find((item: PlannerGoalItem) => item.task_uid === focusedTaskUid) ||
      null;
    const assignment =
      workspace.daily_assignments.find(
        (item: PlannerDailyAssignment) => item.task_uid === focusedTaskUid
      ) || null;
    const alarmPolicy =
      workspace.alarm_policies.find(
        (item: PlannerAlarmPolicy) =>
          item.assignment_id === assignment?.assignment_id || item.task_uid === focusedTaskUid
      ) || null;
    const executionState =
      workspace.execution_states.find(
        (item: PlannerExecutionState) => item.assignment_id === assignment?.assignment_id
      ) || null;

    if (!goalItem && !assignment && !alarmPolicy) {
      return null;
    }

    return {
      taskUid: focusedTaskUid,
      title: assignment?.title || goalItem?.title || "Planner item",
      plannedMinutes:
        assignment?.planned_minutes ?? goalItem?.est_minutes ?? null,
      status:
        executionState?.status ||
        assignment?.status ||
        goalItem?.status ||
        alarmPolicy?.state ||
        null,
      assignment,
      alarmPolicy,
      executionState,
    };
  }, [focusedTaskUid, workspace]);

  const clearFocusedTask = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("task_uid");
    const search = nextParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
      },
      {
        replace: true,
        state: location.state,
      }
    );
  };

  const hasMissingFocusedTask =
    Boolean(focusedTaskUid) && !workspaceLoading && !workspaceError && !focusMatch;

  const renderActiveTab = () => {
    if (activeTab === "deadline") return <DeadlinePlannerPage activeDate={activeDate} />;
    if (activeTab === "today") {
      return (
        <PlanDayPage
          activeDate={activeDate}
          workspace={workspace}
          focusedTaskUid={focusedTaskUid}
          workspaceLoading={workspaceLoading}
          workspaceError={workspaceError}
        />
      );
    }
    return <AddAlarmPage activeDate={activeDate} />;
  };

  return (
    <div className="space-y-4">
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className="rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">
                Planner
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-slate-950">
                마감, 오늘, 알람을 하나의 planner 워크스페이스로 엽니다.
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                기존 분리 페이지는 유지하되, 메인 진입점은 `/planner` 하나로 묶었습니다.
                웹과 앱이 같은 planner 데이터 축으로 수렴할 수 있도록 snapshot 상태도 함께 노출합니다.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`rounded-[28px] border px-5 py-4 text-left transition ${
                    isActive
                      ? "border-sky-500 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:border-sky-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {tab.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Workspace Snapshot
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {workspaceLoading
                    ? "Planner snapshot을 불러오는 중입니다."
                    : workspaceError
                    ? "Planner snapshot을 아직 불러오지 못했습니다. 기존 화면은 그대로 사용할 수 있습니다."
                    : `Active date ${workspace?.active_date ?? activeDate} / source ${
                        workspace?.source.projection_source ?? "unknown"
                      }`}
                </div>
                {workspaceError && (
                  <div className="mt-2 text-xs text-rose-600">{workspaceError}</div>
                )}
              </div>

              <div className="grid min-w-full gap-3 sm:grid-cols-4 lg:min-w-[420px]">
                {snapshotCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      {card.label}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-slate-950">
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {focusedTaskUid && (
            <div
              className={`mt-5 rounded-[28px] border p-4 ${
                focusMatch
                  ? "border-sky-200 bg-[linear-gradient(135deg,_rgba(14,165,233,0.10),_rgba(255,255,255,0.98)_40%,_rgba(16,185,129,0.08))]"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              {workspaceLoading ? (
                <div className="text-sm text-slate-600">
                  Resolving selected planner item for {activeDate}.
                </div>
              ) : workspaceError ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-amber-900">
                      Unable to resolve the selected planner item right now.
                    </div>
                    <div className="mt-1 text-xs text-amber-800">{workspaceError}</div>
                  </div>
                  <button
                    type="button"
                    onClick={clearFocusedTask}
                    className="inline-flex items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                  >
                    Clear focus
                  </button>
                </div>
              ) : focusMatch ? (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                      <Crosshair className="h-3.5 w-3.5" />
                      {focusSource === "mobile_calendar_item"
                        ? "Selected From Mobile Calendar"
                        : "Focused Planner Item"}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-slate-950">
                        {focusMatch.title}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-500">
                        {focusMatch.taskUid}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                        Status {formatFocusStatus(focusMatch.status)}
                      </span>
                      {focusMatch.plannedMinutes != null && (
                        <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                          {focusMatch.plannedMinutes} min
                        </span>
                      )}
                      <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                        {formatAlarmWindow(focusMatch.alarmPolicy)}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                        Date {focusMatch.assignment?.date ?? activeDate}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {activeTab !== "today" && (
                      <button
                        type="button"
                        onClick={() => handleTabChange("today")}
                        className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
                      >
                        Today tab
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    {focusMatch.alarmPolicy && activeTab !== "alarm" && (
                      <button
                        type="button"
                        onClick={() => handleTabChange("alarm")}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Alarm tab
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearFocusedTask}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Clear focus
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-amber-100 p-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-amber-900">
                        The selected planner item is not available for {activeDate}.
                      </div>
                      <div className="mt-1 font-mono text-xs text-amber-800">
                        {focusedTaskUid}
                      </div>
                    </div>
                  </div>

                  {hasMissingFocusedTask && (
                    <button
                      type="button"
                      onClick={clearFocusedTask}
                      className="inline-flex items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                    >
                      Clear focus
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {renderActiveTab()}
    </div>
  );
};

export default PlannerPage;
