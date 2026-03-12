import type { DeadlineGoalPlan } from "../types/deadlinePlanner";

export const DEADLINE_GOALS_CHANGED_EVENT = "eft:deadline-goals:changed";

const STORAGE_PREFIX = "eft.deadline-goals.v1";

const buildStorageKey = (userId: string) => `${STORAGE_PREFIX}:${userId}`;

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

export const listDeadlineGoals = (userId: string): DeadlineGoalPlan[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(buildStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeadlineGoalPlan[];
    return sortPlans(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

export const writeDeadlineGoals = (userId: string, plans: DeadlineGoalPlan[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildStorageKey(userId), JSON.stringify(sortPlans(plans)));
  emitChanged(userId);
};

export const upsertDeadlineGoal = (userId: string, nextPlan: DeadlineGoalPlan) => {
  const existing = listDeadlineGoals(userId);
  const nextPlans = existing.some((plan) => plan.id === nextPlan.id)
    ? existing.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
    : [nextPlan, ...existing];
  writeDeadlineGoals(userId, nextPlans);
  return nextPlan;
};

export const updateDeadlineGoal = (
  userId: string,
  planId: string,
  updater: (plan: DeadlineGoalPlan) => DeadlineGoalPlan
) => {
  const existing = listDeadlineGoals(userId);
  let updatedPlan: DeadlineGoalPlan | null = null;
  const nextPlans = existing.map((plan) => {
    if (plan.id !== planId) return plan;
    updatedPlan = updater(plan);
    return updatedPlan;
  });
  if (!updatedPlan) return null;
  writeDeadlineGoals(userId, nextPlans);
  return updatedPlan;
};

export const deleteDeadlineGoal = (userId: string, planId: string) => {
  const nextPlans = listDeadlineGoals(userId).filter((plan) => plan.id !== planId);
  writeDeadlineGoals(userId, nextPlans);
};
