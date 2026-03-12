import { describe, expect, it } from "vitest";
import {
  buildProfileCompletion,
  buildProfileReadiness,
  normalizeMyPageForm,
} from "./myPage.utils";

describe("myPage utils", () => {
  it("normalizes single and multi line inputs", () => {
    const normalized = normalizeMyPageForm({
      aspirationStatement: "  실행을 만든다  ",
      targetIdentity: "  운영자 ",
      northStarGoal: "  제품 성장 ",
      horizon90dText: " 기능 출시 \r\n  사용자 인터뷰 ",
      valuesText: " 정직함 \n 지속 가능성 ",
      constraintsText: " 오전 집중 ",
      strengthsText: " 구조화 ",
      experienceText: " 런칭 ",
      domainFocusText: " AI ",
      certificationsText: " SQLD ",
      toolStackText: " React \n Firebase ",
    });

    expect(normalized.aspirationStatement).toBe("실행을 만든다");
    expect(normalized.horizon90dText).toBe("기능 출시\n사용자 인터뷰");
    expect(normalized.toolStackText).toBe("React\nFirebase");
  });

  it("builds completion and readiness states", () => {
    const form = normalizeMyPageForm({
      aspirationStatement: "실행을 만든다",
      targetIdentity: "운영자",
      northStarGoal: "제품 성장",
      horizon90dText: "기능 출시",
      valuesText: "정직함",
      constraintsText: "",
      strengthsText: "문제 구조화",
      experienceText: "런칭 3회",
      domainFocusText: "AI",
      certificationsText: "",
      toolStackText: "React",
    });

    expect(buildProfileCompletion(form)).toBeGreaterThanOrEqual(75);
    expect(buildProfileReadiness(form)).toEqual({
      identity: true,
      plan: true,
      execution: true,
    });
  });
});
