import {
  loadPlannerClientState,
  updatePlannerClientState,
} from "./plannerClientStateService";
import type { DeadlineGoalPlan } from "../types/deadlinePlanner";

export const DEADLINE_GOALS_CHANGED_EVENT = "eft:deadline-goals:changed";

const sortPlans = (plans: DeadlineGoalPlan[]) =>
  [...plans].sort((left, right) => {
    if (left.deadlineDate !== right.deadlineDate) {
      return left.deadlineDate.localeCompare(right.deadlineDate);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

const emitChanged = (userId: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DEADLINE_GOALS_CHANGED_EVENT, {
      detail: { userId },
    })
  );
};

export const listDeadlineGoals = async (userId: string): Promise<DeadlineGoalPlan[]> => {
  if (!userId) return [];
  const snapshot = await loadPlannerClientState(userId);
  return sortPlans(snapshot.deadline_goals);
};

export const writeDeadlineGoals = async (
  userId: string,
  plans: DeadlineGoalPlan[]
): Promise<DeadlineGoalPlan[]> => {
  if (!userId) return [];
  const snapshot = await updatePlannerClientState(userId, (current) => ({
    ...current,
    deadline_goals: sortPlans(plans),
  }));
  emitChanged(userId);
  return sortPlans(snapshot.deadline_goals);
};

export const upsertDeadlineGoal = async (
  userId: string,
  nextPlan: DeadlineGoalPlan
): Promise<DeadlineGoalPlan> => {
  const existing = await listDeadlineGoals(userId);
  const nextPlans = existing.some((plan) => plan.id === nextPlan.id)
    ? existing.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
    : [nextPlan, ...existing];
  await writeDeadlineGoals(userId, nextPlans);
  return nextPlan;
};

export const updateDeadlineGoal = async (
  userId: string,
  planId: string,
  updater: (plan: DeadlineGoalPlan) => DeadlineGoalPlan
): Promise<DeadlineGoalPlan | null> => {
  const existing = await listDeadlineGoals(userId);
  let updatedPlan: DeadlineGoalPlan | null = null;
  const nextPlans = existing.map((plan) => {
    if (plan.id !== planId) return plan;
    updatedPlan = updater(plan);
    return updatedPlan;
  });
  if (!updatedPlan) return null;
  await writeDeadlineGoals(userId, nextPlans);
  return updatedPlan;
};

export const deleteDeadlineGoal = async (
  userId: string,
  planId: string
): Promise<void> => {
  const nextPlans = (await listDeadlineGoals(userId)).filter(
    (plan) => plan.id !== planId
  );
  await writeDeadlineGoals(userId, nextPlans);
};
