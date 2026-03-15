import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellPlus,
  CalendarClock,
  Crosshair,
  ListTodo,
  UserRound,
} from "lucide-react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

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
  buildAddAlarmHref,
  buildPlannerHref,
  normalizePlannerActiveDate,
  normalizePlannerTab,
  type PlannerTab,
} from "../utils/plannerRoutes";

const TABS: Array<{
  id: Exclude<PlannerTab, "alarm">;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "today",
    label: "Today",
    description: "Run the live daily execution board in one focused workspace.",
    icon: CalendarClock,
  },
  {
    id: "deadline",
    label: "Deadline",
    description: "Break down long goals and keep delivery windows under control.",
    icon: ListTodo,
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

  const handleTabChange = (nextTab: Exclude<PlannerTab, "alarm">) => {
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
        label: "Goal Items",
        value: workspace?.goal_items.length ?? 0,
      },
      {
        label: "Today Assignments",
        value: workspace?.daily_assignments.length ?? 0,
      },
      {
        label: "Alarm Policies",
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
      plannedMinutes: assignment?.planned_minutes ?? goalItem?.est_minutes ?? null,
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

  if (activeTab === "alarm") {
    return (
      <Navigate
        to={buildAddAlarmHref({
          baseSearchParams: searchParams,
          activeDate,
        })}
        replace
        state={location.state}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className="rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(14,165,233,0.12),_rgba(255,255,255,0.98)_42%,_rgba(16,185,129,0.10))] p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
            <div>
              <div className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Planner Workspace
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                The operating room for daily execution and deadline control
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Planner now owns the live board for today and the deadline system for long-range
                delivery. Alarm creation has been pulled into a dedicated Alarm Studio so each
                screen does one job at production quality.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  Today + Deadline only
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  Alarm Studio separated
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  Shared Workspace Snapshot
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    buildAddAlarmHref({
                      baseSearchParams: searchParams,
                      activeDate,
                    }),
                    {
                      state: location.state,
                    }
                  )
                }
                className="rounded-[28px] border border-slate-200 bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <BellPlus className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-950">
                  Open Alarm Studio
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Design execution blocks, repeat rules, and sync strategy in the dedicated flow.
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate("/my-page")}
                className="rounded-[28px] border border-slate-200 bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-950">
                  Open My Page
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Shape identity, strengths, and constraints before you build execution logic.
                </div>
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
                      ? "border-sky-500 bg-white shadow-sm"
                      : "border-slate-200 bg-slate-50/90 hover:border-sky-300 hover:bg-white"
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

          <div className="mt-5 rounded-[28px] border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Workspace Snapshot
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {workspaceLoading
                    ? "Loading planner snapshot."
                    : workspaceError
                    ? "Planner snapshot is temporarily unavailable. The current screen remains usable."
                    : `Active date ${workspace?.active_date ?? activeDate} / source ${
                        workspace?.source.projection_source ?? "unknown"
                      }`}
                </div>
                {workspaceError && (
                  <div className="mt-2 text-xs text-rose-600">{workspaceError}</div>
                )}
              </div>

              <div className="grid min-w-full gap-3 sm:grid-cols-4 lg:min-w-[440px]">
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
                    Clear Focus
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
                        Today Tab
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    {focusMatch.alarmPolicy && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            buildAddAlarmHref({
                              baseSearchParams: searchParams,
                              activeDate,
                            }),
                            {
                              state: location.state,
                            }
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Alarm Studio
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearFocusedTask}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Clear Focus
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
                      Clear Focus
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {activeTab === "deadline" ? (
        <DeadlinePlannerPage activeDate={activeDate} />
      ) : (
        <PlanDayPage
          activeDate={activeDate}
          workspace={workspace}
          focusedTaskUid={focusedTaskUid}
          workspaceLoading={workspaceLoading}
          workspaceError={workspaceError}
        />
      )}
    </div>
  );
};

export default PlannerPage;
