import { describe, expect, it } from "vitest";

import { getAppDay, getPilotWeekNumber } from "./appDay";

describe("getAppDay", () => {
  it("keeps timestamps before 4am Eastern on the previous app day", () => {
    expect(getAppDay(new Date("2026-09-15T07:59:59Z"))).toBe("2026-09-14");
  });

  it("starts a new app day at 4am Eastern", () => {
    expect(getAppDay(new Date("2026-09-15T08:00:00Z"))).toBe("2026-09-15");
  });

  it("uses the daylight-saving offset at the spring transition", () => {
    expect(getAppDay(new Date("2026-03-08T07:59:59Z"))).toBe("2026-03-07");
    expect(getAppDay(new Date("2026-03-08T08:00:00Z"))).toBe("2026-03-08");
  });

  it("uses the standard-time offset at the fall transition", () => {
    expect(getAppDay(new Date("2026-11-01T08:59:59Z"))).toBe("2026-10-31");
    expect(getAppDay(new Date("2026-11-01T09:00:00Z"))).toBe("2026-11-01");
  });

  it("rejects an invalid timestamp", () => {
    expect(() => getAppDay(new Date("not-a-date"))).toThrow(RangeError);
  });
});

describe("getPilotWeekNumber", () => {
  it.each([
    ["2026-09-15", "2026-09-14", 1],
    ["2026-09-15", "2026-09-15", 1],
    ["2026-09-15", "2026-09-21", 1],
    ["2026-09-15", "2026-09-22", 2],
    ["2026-09-15", "2026-10-12", 4],
    ["2026-09-15", "2026-10-13", 4],
  ])("maps %s through %s to pilot week %i", (startDate, appDay, expected) => {
    expect(getPilotWeekNumber(startDate, appDay)).toBe(expected);
  });
});
