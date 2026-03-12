import { describe, expect, it } from "vitest";
import { formatRepeatLabel, resolveAlarmWindow } from "./addAlarm.utils";

describe("addAlarm utils", () => {
  it("resolves same-day alarm windows", () => {
    const window = resolveAlarmWindow(
      "2026-03-12",
      {
        start_time: "09:00",
        end_time: "10:30",
        ends_next_day: false,
        repeat: "daily",
      },
      30
    );

    expect(window).not.toBeNull();
    expect(window?.durationMinutes).toBe(90);
    expect(window?.startLabel).toBe("09:00");
    expect(window?.endLabel).toBe("10:30");
  });

  it("resolves overnight alarm windows", () => {
    const window = resolveAlarmWindow(
      "2026-03-12",
      {
        start_time: "23:30",
        end_time: "01:00",
        ends_next_day: true,
        repeat: "once",
      },
      30
    );

    expect(window).not.toBeNull();
    expect(window?.durationMinutes).toBe(90);
  });

  it("formats repeat labels", () => {
    expect(formatRepeatLabel("weekdays")).toBe("평일");
    expect(formatRepeatLabel("custom", [1, 3, 5])).toBe(
      "월요일, 수요일, 금요일"
    );
  });
});
