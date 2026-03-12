import { describe, expect, it } from "vitest";

import {
  addMinutesToKoreaOffsetDateTime,
  buildKoreaOffsetDateTime,
  getKoreaTimeLabel,
  parseKoreaTimeValue,
  todayInKoreaIso,
} from "./koreaTime";

describe("koreaTime", () => {
  it("formats today using Korea time", () => {
    expect(todayInKoreaIso(new Date("2026-03-11T16:00:00.000Z"))).toBe("2026-03-12");
  });

  it("builds a Korea offset datetime string from date and time", () => {
    expect(buildKoreaOffsetDateTime("2026-03-12", "14:00")).toBe(
      "2026-03-12T14:00:00+09:00"
    );
  });

  it("adds minutes while preserving Korea offset semantics", () => {
    expect(
      addMinutesToKoreaOffsetDateTime("2026-03-12T23:30:00+09:00", 120)
    ).toBe("2026-03-13T01:30:00+09:00");
  });

  it("converts UTC timestamps to Korea wall-clock labels", () => {
    expect(getKoreaTimeLabel("2026-03-12T05:00:00.000Z")).toBe("14:00");
  });

  it("keeps timezone-free local schedule strings as entered", () => {
    expect(getKoreaTimeLabel("2026-03-12T14:00:00")).toBe("14:00");
  });

  it("parses Korea time labels into timeline values", () => {
    expect(parseKoreaTimeValue("2026-03-12T05:30:00.000Z")).toBe(14.5);
  });
});
