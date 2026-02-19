import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TaskInputStep from "./TaskInputStep";

describe("TaskInputStep", () => {
  it("includes resistance level in onNext payload", () => {
    const onNext = vi.fn();

    render(
      <TaskInputStep
        onNext={onNext}
        privacyMode="NORMAL"
        onPrivacyModeChange={vi.fn()}
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText("예) 수학 문제집 2페이지 풀기"),
      { target: { value: "테스트 일정" } }
    );
    fireEvent.change(screen.getByLabelText("일정 저항감"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        task_title: "테스트 일정",
        resistance_level: 8,
      })
    );
  });
});
