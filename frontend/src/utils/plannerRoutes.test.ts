import { describe, expect, it } from "vitest";

import {
  buildAddAlarmHref,
  buildPlannerHref,
  normalizePlannerTab,
} from "./plannerRoutes";

describe("plannerRoutes", () => {
  it("defaults planner navigation to the today workspace", () => {
    expect(normalizePlannerTab(null)).toBe("today");
    expect(buildPlannerHref("today", { activeDate: "2026-03-14" })).toBe(
      "/planner?active_date=2026-03-14"
    );
  });

  it("preserves shared search params when moving inside planner", () => {
    expect(
      buildPlannerHref("deadline", {
        activeDate: "2026-03-14",
        baseSearchParams: "?task_uid=item-1&source=mobile_calendar_item&tab=alarm",
      })
    ).toBe(
      "/planner?task_uid=item-1&source=mobile_calendar_item&tab=deadline&active_date=2026-03-14"
    );
  });

  it("removes planner tabs when building the dedicated add alarm route", () => {
    expect(
      buildAddAlarmHref({
        baseSearchParams: "?tab=deadline&active_date=2026-03-14&task_uid=item-1",
      })
    ).toBe("/add-alarm?active_date=2026-03-14&task_uid=item-1");
  });
});
