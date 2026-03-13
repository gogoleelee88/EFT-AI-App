import React, { useEffect, useMemo, useRef } from "react";
import { BellRing, CheckCircle2, Clock3, Crosshair, ListTodo } from "lucide-react";

import Card from "../ui/Card";
import type {
  PlannerAlarmPolicy,
  PlannerDailyAssignment,
  PlannerExecutionState,
  PlannerWorkspaceResponse,
} from "../../services/plannerWorkspaceService";

type PlannerAssignmentSurfaceProps = {
  workspace: PlannerWorkspaceResponse | null;
  activeDate: string;
  focusedTaskUid?: string | null;
  loading?: boolean;
  error?: string | null;
};

type PlannerAssignmentRow = {
  assignment: PlannerDailyAssignment;
  alarmPolicy: PlannerAlarmPolicy | null;
  executionState: PlannerExecutionState | null;
};

const formatStatus = (value: string | null | undefined) => {
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
  if (!policy?.start_time) return "No alarm linked";
  if (!policy.end_time) return `${policy.start_time} start`;
  return policy.ends_next_day
    ? `${policy.start_time} - ${policy.end_time} (+1d)`
    : `${policy.start_time} - ${policy.end_time}`;
};

const compareByAlarmWindow = (left: PlannerAssignmentRow, right: PlannerAssignmentRow) => {
  const leftTime = left.alarmPolicy?.start_time || "99:99";
  const rightTime = right.alarmPolicy?.start_time || "99:99";
  if (leftTime !== rightTime) {
    return leftTime.localeCompare(rightTime);
  }
  return left.assignment.title.localeCompare(right.assignment.title);
};

const PlannerAssignmentSurface: React.FC<PlannerAssignmentSurfaceProps> = ({
  workspace,
  activeDate,
  focusedTaskUid,
  loading = false,
  error = null,
}) => {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const assignmentRows = useMemo<PlannerAssignmentRow[]>(() => {
    if (!workspace) return [];

    return workspace.daily_assignments
      .filter((assignment) => assignment.date === activeDate)
      .map((assignment) => ({
        assignment,
        alarmPolicy:
          workspace.alarm_policies.find(
            (policy) =>
              policy.assignment_id === assignment.assignment_id ||
              policy.task_uid === assignment.task_uid
          ) || null,
        executionState:
          workspace.execution_states.find(
            (state) => state.assignment_id === assignment.assignment_id
          ) || null,
      }))
      .sort(compareByAlarmWindow);
  }, [activeDate, workspace]);

  const focusedAssignment = useMemo(
    () =>
      focusedTaskUid
        ? assignmentRows.find((row) => row.assignment.task_uid === focusedTaskUid) || null
        : null,
    [assignmentRows, focusedTaskUid]
  );

  useEffect(() => {
    if (!focusedAssignment) return;
    const node = itemRefs.current[focusedAssignment.assignment.task_uid];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.focus({ preventScroll: true });
  }, [focusedAssignment]);

  const linkedAlarmCount = assignmentRows.filter((row) => Boolean(row.alarmPolicy)).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      <Card className="border-slate-200 bg-white/90">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                <ListTodo className="h-3.5 w-3.5" />
                Canonical Daily Assignments
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">
                Planner assignments for {activeDate}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                This list is rendered from the shared planner workspace, not from local
                Google-only or app-only schedule drafts.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  Assignments
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-950">
                  {assignmentRows.length}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  Alarm linked
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-950">
                  {linkedAlarmCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  Focus
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {focusedAssignment ? "Resolved" : focusedTaskUid ? "Pending or missing" : "None"}
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Loading canonical assignments from planner workspace.
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
              {error}
            </div>
          ) : assignmentRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              No planner assignments are available for this date yet.
            </div>
          ) : (
            <div className="space-y-3">
              {assignmentRows.map((row) => {
                const isFocused = row.assignment.task_uid === focusedTaskUid;
                const status =
                  row.executionState?.status ||
                  row.assignment.status ||
                  row.alarmPolicy?.state ||
                  null;

                return (
                  <div
                    key={row.assignment.assignment_id}
                    ref={(node) => {
                      itemRefs.current[row.assignment.task_uid] = node;
                    }}
                    tabIndex={-1}
                    data-planner-task-uid={row.assignment.task_uid}
                    className={`rounded-[24px] border px-4 py-4 outline-none transition ${
                      isFocused
                        ? "border-sky-400 bg-sky-50 shadow-sm ring-4 ring-sky-100"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isFocused && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">
                              <Crosshair className="h-3 w-3" />
                              Focused item
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            <CheckCircle2 className="h-3 w-3" />
                            {formatStatus(status)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            <Clock3 className="h-3 w-3" />
                            {row.assignment.planned_minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            <BellRing className="h-3 w-3" />
                            {formatAlarmWindow(row.alarmPolicy)}
                          </span>
                        </div>

                        <div className="mt-3 text-base font-semibold text-slate-950">
                          {row.assignment.title}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500">
                          {row.assignment.task_uid}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span className="rounded-full bg-slate-100 px-3 py-1">
                          Assignment {row.assignment.assignment_id}
                        </span>
                        {row.executionState && (
                          <span className="rounded-full bg-slate-100 px-3 py-1">
                            Execution {row.executionState.execution_state_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default PlannerAssignmentSurface;
