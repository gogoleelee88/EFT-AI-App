import { describe, expect, it } from "vitest";

import {
  buildGoalSummary,
  buildTodayGoalHeadline,
  createDeadlineGoalPlan,
  getGoalAgendaForDate,
  pullGoalItemsForward,
  toggleGoalChecklistItem,
} from "./deadlinePlanner";

describe("deadlinePlanner", () => {
  it("splits checklist items across available work dates", () => {
    const plan = createDeadlineGoalPlan({
      title: "앱 출시 준비",
      startDate: "2026-03-12",
      deadlineDate: "2026-03-14",
      windowStartTime: "19:00",
      windowEndTime: "20:00",
      endsNextDay: false,
      repeat: "daily",
      customDays: [],
      totalMinutes: 180,
      checklistText: "요구사항 정리 | 60\n디자인 정리 | 60\nQA 점검 | 60",
    });

    expect(Object.keys(plan.assignments)).toEqual([
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
    ]);
  });

  it("surfaces overdue tasks in today's agenda and updates summary", () => {
    const basePlan = createDeadlineGoalPlan({
      title: "리포트 마감",
      startDate: "2026-03-10",
      deadlineDate: "2026-03-12",
      windowStartTime: "18:00",
      windowEndTime: "19:00",
      endsNextDay: false,
      repeat: "daily",
      customDays: [],
      totalMinutes: 120,
      checklistText: "자료 모으기 | 60\n초안 작성 | 60",
    });
    const donePlan = toggleGoalChecklistItem(basePlan, basePlan.items[0].id, "2026-03-10T12:00:00.000Z");
    const agenda = getGoalAgendaForDate(donePlan, "2026-03-12");
    const summary = buildGoalSummary(donePlan, "2026-03-12");

    expect(agenda.pendingItems).toHaveLength(1);
    expect(summary.completionRate).toBe(50);
    expect(summary.overdueCount).toBe(1);
  });

  it("can pull tomorrow's work into today once visible work is completed", () => {
    const basePlan = createDeadlineGoalPlan({
      title: "제안서 제출",
      startDate: "2026-03-12",
      deadlineDate: "2026-03-13",
      windowStartTime: "19:00",
      windowEndTime: "21:00",
      endsNextDay: false,
      repeat: "daily",
      customDays: [],
      totalMinutes: 165,
      checklistText: "초안 작성 | 45\n교정 | 45\n세부 보완 | 45\n제출 | 30",
    });

    let nextPlan = toggleGoalChecklistItem(basePlan, basePlan.items[0].id, "2026-03-12T12:00:00.000Z");
    nextPlan = toggleGoalChecklistItem(nextPlan, basePlan.items[1].id, "2026-03-12T12:10:00.000Z");
    const pulledPlan = pullGoalItemsForward(nextPlan, "2026-03-12");
    const headline = buildTodayGoalHeadline([pulledPlan], "2026-03-12");

    expect((nextPlan.assignments["2026-03-13"] || []).length).toBeGreaterThan(0);
    expect((pulledPlan.assignments["2026-03-13"] || []).length).toBeLessThan(
      (nextPlan.assignments["2026-03-13"] || []).length
    );
    expect((pulledPlan.assignments["2026-03-12"] || []).length).toBeGreaterThan(
      (nextPlan.assignments["2026-03-12"] || []).length
    );
    expect(headline?.plan.id).toBe(pulledPlan.id);
  });
});
