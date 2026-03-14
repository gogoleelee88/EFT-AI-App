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

export function useDeadlineGoals(
  userId?: string,
  focusDate: string = todayInKoreaIso()
) {
  const [plans, setPlans] = useState<DeadlineGoalPlan[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setPlans([]);
      return [] as DeadlineGoalPlan[];
    }
    const nextPlans = await listDeadlineGoals(userId);
    setPlans(nextPlans);
    return nextPlans;
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    const handleStorageChange = () => {
      void refresh();
    };
    const handleCustomChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) {
        void refresh();
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

    let cancelled = false;
    void (async () => {
      const now = Date.now();
      const sessionKey = `${TOUCH_SESSION_PREFIX}:${userId}`;
      const lastTouchedAt = Number(window.sessionStorage.getItem(sessionKey) || "0");
      if (now - lastTouchedAt < TOUCH_INTERVAL_MS) return;

      const currentPlans = await listDeadlineGoals(userId);
      const touchedPlans = touchGoalPlans(currentPlans);
      if (touchedPlans.length > 0) {
        await writeDeadlineGoals(userId, touchedPlans);
        if (!cancelled) {
          setPlans(touchedPlans);
        }
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
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return "unsupported" as const;
    }
    return Notification.requestPermission();
  }, []);

  const saveGoal = useCallback(
    async (draft: DeadlineGoalDraft, existingPlan?: DeadlineGoalPlan | null) => {
      if (!userId) return null;
      const nextPlan = createDeadlineGoalPlan(draft, { existingPlan });
      await upsertDeadlineGoal(userId, nextPlan);
      await refresh();
      return nextPlan;
    },
    [refresh, userId]
  );

  const toggleItem = useCallback(
    async (planId: string, itemId: string) => {
      if (!userId) return null;
      const updated = await updateDeadlineGoal(userId, planId, (plan) =>
        toggleGoalChecklistItem(plan, itemId)
      );
      await refresh();
      return updated;
    },
    [refresh, userId]
  );

  const pullForward = useCallback(
    async (planId: string, dateIso: string = focusDate) => {
      if (!userId) return null;
      const updated = await updateDeadlineGoal(userId, planId, (plan) =>
        pullGoalItemsForward(plan, dateIso)
      );
      await refresh();
      return updated;
    },
    [focusDate, refresh, userId]
  );

  const removeGoal = useCallback(
    async (planId: string) => {
      if (!userId) return;
      await deleteDeadlineGoal(userId, planId);
      await refresh();
    },
    [refresh, userId]
  );

  const todayHeadline = useMemo(
    () => buildTodayGoalHeadline(plans, focusDate),
    [focusDate, plans]
  );
  const summaries = useMemo(
    () => plans.map((plan) => buildGoalSummary(plan, focusDate)),
    [focusDate, plans]
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
