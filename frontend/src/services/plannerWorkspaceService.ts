import { todayInKoreaIso } from "../utils/koreaTime";

export interface PlannerWorkspaceSource {
  projection_source?: string;
  day_id?: number | null;
  day_plan_version?: number;
  reminder_count?: number;
}

export interface PlannerGoalItem {
  goal_item_id: string;
  source?: string;
  task_id?: number | null;
  task_uid?: string;
  title?: string;
  est_minutes?: number;
  status?: string;
  updated_at?: string | null;
}

export interface PlannerDailyAssignment {
  assignment_id: string;
  date: string;
  goal_item_ids: string[];
  planned_minutes: number;
  task_uid: string;
  title: string;
  status?: string;
  updated_at?: string | null;
}

export interface PlannerAlarmPolicy {
  alarm_policy_id: string;
  assignment_id?: string;
  task_uid?: string;
  start_time?: string | null;
  end_time?: string | null;
  ends_next_day?: boolean;
  repeat?: string;
  custom_days?: number[];
  source_type?: string;
  channels?: string[];
  state?: string;
  next_fire_at_utc?: string | null;
  updated_at?: string | null;
}

export interface PlannerExecutionState {
  execution_state_id: string;
  assignment_id: string;
  status?: string;
  completed_goal_item_ids: string[];
  updated_at?: string | null;
}

export interface PlannerWorkspaceResponse {
  workspace_id: string;
  user_id: string;
  timezone: string;
  active_date: string;
  version: number;
  updated_at: string | null;
  source: PlannerWorkspaceSource;
  deadlines: Array<Record<string, unknown>>;
  goal_items: PlannerGoalItem[];
  daily_assignments: PlannerDailyAssignment[];
  alarm_policies: PlannerAlarmPolicy[];
  execution_states: PlannerExecutionState[];
}

export async function fetchPlannerWorkspace(
  activeDate: string = todayInKoreaIso()
): Promise<PlannerWorkspaceResponse> {
  const params = new URLSearchParams({ active_date: activeDate });
  const response = await fetch(`/api/spec/plan/workspace?${params.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Planner workspace fetch failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        message = payload.detail;
      }
    } catch {
      // Keep default error text.
    }
    throw new Error(message);
  }

  return response.json();
}
