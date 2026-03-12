import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEADLINE_GOALS_CHANGED_EVENT,
  deleteDeadlineGoal,
  listDeadlineGoals,
  updateDeadlineGoal,
  upsertDeadlineGoal,
  writeDeadlineGoals,
} from "../services/deadlinePlannerService";
import type { DeadlineGoalDraft, DeadlineGoalPlan } from "../types/deadlinePlanner";
import {
  buildGoalDriftMessage,
  buildGoalSummary,
  buildLocalGoalNotification,
  buildTodayGoalHeadline,
  createDeadlineGoalPlan,
  pullGoalItemsForward,
  toggleGoalChecklistItem,
  touchGoalPlans,
} from "../utils/deadlinePlanner";
import { todayInKoreaIso } from "../utils/koreaTime";

const TOUCH_INTERVAL_MS = 10 * 60 * 1000;
const TOUCH_SESSION_PREFIX = "eft.deadline-goals.touch";
const DRIFT_NOTICE_PREFIX = "eft.deadline-goals.drift";

const maybeShowNotification = async (title: string, body: string) => {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, { body, tag: "deadline-goal-drift" });
        return;
      }
    }
  } catch {
    // Fall back to Notification constructor.
  }

  try {
    new Notification(title, { body });
  } catch {
    // Ignore local notification failures.
  }
};

export function useDeadlineGoals(userId?: string) {
  const [plans, setPlans] = useState<DeadlineGoalPlan[]>([]);

  const refresh = useCallback(() => {
    if (!userId) {
      setPlans([]);
      return [];
    }
    const nextPlans = listDeadlineGoals(userId);
    setPlans(nextPlans);
    return nextPlans;
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    const handleStorageChange = () => {
      refresh();
    };
    const handleCustomChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) {
        refresh();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(
      DEADLINE_GOALS_CHANGED_EVENT,
      handleCustomChange as EventListener
    );
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        DEADLINE_GOALS_CHANGED_EVENT,
        handleCustomChange as EventListener
      );
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    const now = Date.now();
    const sessionKey = `${TOUCH_SESSION_PREFIX}:${userId}`;
    const lastTouchedAt = Number(window.sessionStorage.getItem(sessionKey) || "0");
    if (now - lastTouchedAt < TOUCH_INTERVAL_MS) return;

    const touchedPlans = touchGoalPlans(listDeadlineGoals(userId));
    if (touchedPlans.length > 0) {
      writeDeadlineGoals(userId, touchedPlans);
      setPlans(touchedPlans);
    }
    window.sessionStorage.setItem(sessionKey, String(now));

    const todayIso = todayInKoreaIso();
    touchedPlans.forEach((plan) => {
      const driftMessage = buildGoalDriftMessage(plan, todayIso);
      if (!driftMessage) return;
      const noticeKey = `${DRIFT_NOTICE_PREFIX}:${userId}:${plan.id}:${todayIso}`;
      if (window.localStorage.getItem(noticeKey)) return;
      const notification = buildLocalGoalNotification(plan, todayIso);
      void maybeShowNotification(notification.title, notification.body);
      window.localStorage.setItem(noticeKey, new Date().toISOString());
    });
  }, [userId]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return "unsupported" as const;
    }
    return Notification.requestPermission();
  }, []);

  const saveGoal = useCallback(
    (draft: DeadlineGoalDraft, existingPlan?: DeadlineGoalPlan | null) => {
      if (!userId) return null;
      const nextPlan = createDeadlineGoalPlan(draft, { existingPlan });
      upsertDeadlineGoal(userId, nextPlan);
      setPlans(listDeadlineGoals(userId));
      return nextPlan;
    },
    [userId]
  );

  const toggleItem = useCallback(
    (planId: string, itemId: string) => {
      if (!userId) return null;
      const updated = updateDeadlineGoal(userId, planId, (plan) =>
        toggleGoalChecklistItem(plan, itemId)
      );
      setPlans(listDeadlineGoals(userId));
      return updated;
    },
    [userId]
  );

  const pullForward = useCallback(
    (planId: string, dateIso: string = todayInKoreaIso()) => {
      if (!userId) return null;
      const updated = updateDeadlineGoal(userId, planId, (plan) =>
        pullGoalItemsForward(plan, dateIso)
      );
      setPlans(listDeadlineGoals(userId));
      return updated;
    },
    [userId]
  );

  const removeGoal = useCallback(
    (planId: string) => {
      if (!userId) return;
      deleteDeadlineGoal(userId, planId);
      setPlans(listDeadlineGoals(userId));
    },
    [userId]
  );

  const todayIso = todayInKoreaIso();
  const todayHeadline = useMemo(
    () => buildTodayGoalHeadline(plans, todayIso),
    [plans, todayIso]
  );
  const summaries = useMemo(
    () => plans.map((plan) => buildGoalSummary(plan, todayIso)),
    [plans, todayIso]
  );

  return {
    plans,
    summaries,
    todayHeadline,
    refresh,
    requestNotificationPermission,
    saveGoal,
    toggleItem,
    pullForward,
    removeGoal,
  };
}
