import { describe, expect, it } from "vitest";

import { buildExecutionRecoveryPlan } from "./executionRecovery";

describe("executionRecovery", () => {
  it("uses a small opening action for anxious coding prompts", () => {
    const plan = buildExecutionRecoveryPlan({
      emotion: "anxious",
      situation: "I am stuck implementing Google login",
    });

    expect(plan.emotion).toBe("anxious");
    expect(plan.microAction.instruction).toBe("Open the project folder.");
  });

  it("reads the first error line for blocked debugging prompts", () => {
    const plan = buildExecutionRecoveryPlan({
      emotion: "blocked",
      situation: "I am stuck on this error in the build",
    });

    expect(plan.microAction.instruction).toBe("Read the first error line.");
  });

  it("reopens the work surface for tired prompts", () => {
    const plan = buildExecutionRecoveryPlan({
      emotion: "tired",
      situation: "I feel exhausted and cannot get back to coding",
    });

    expect(plan.microAction.instruction).toBe("Reopen the last work tab.");
  });

  it("avoids planning verbs for avoidant prompts", () => {
    const plan = buildExecutionRecoveryPlan({
      emotion: "avoidant",
      situation: "I keep avoiding this task",
    });

    expect(plan.microAction.instruction.startsWith("Think")).toBe(false);
    expect(plan.microAction.instruction.startsWith("Analyze")).toBe(false);
    expect(plan.microAction.instruction.startsWith("Plan")).toBe(false);
  });
});
