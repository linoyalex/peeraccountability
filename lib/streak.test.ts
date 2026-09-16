import { describe, expect, it } from "vitest";

import {
  calculateRunStats,
  habitScheduleSchema,
  isAppDayRequired,
  type HabitSchedule,
  type StreakProof,
} from "./streak";

const daily: HabitSchedule = {
  schedule_type: "daily",
  schedule_config: {},
};

const fixed: HabitSchedule = {
  schedule_type: "weekdays_fixed",
  schedule_config: { weekdays: [1, 3, 5] },
};

const floating: HabitSchedule = {
  schedule_type: "days_per_week_floating",
  schedule_config: { days_per_week: 3 },
};

function proof(appDay: string, status: StreakProof["status"] = "backed"): StreakProof {
  return { appDay, status };
}

describe("habitScheduleSchema", () => {
  it("accepts each supported schedule shape", () => {
    expect(habitScheduleSchema.parse(daily)).toEqual(daily);
    expect(habitScheduleSchema.parse(fixed)).toEqual(fixed);
    expect(habitScheduleSchema.parse(floating)).toEqual(floating);
  });

  it("rejects invalid or duplicate weekday values", () => {
    expect(() =>
      habitScheduleSchema.parse({
        schedule_type: "weekdays_fixed",
        schedule_config: { weekdays: [1, 1, 8] },
      }),
    ).toThrow();
  });

  it("rejects a floating quota outside one through six", () => {
    expect(() =>
      habitScheduleSchema.parse({
        schedule_type: "days_per_week_floating",
        schedule_config: { days_per_week: 7 },
      }),
    ).toThrow();
  });
});

describe("isAppDayRequired", () => {
  it("only marks configured weekdays as due for a fixed schedule", () => {
    expect(isAppDayRequired(fixed, "2026-09-14")).toBe(true);
    expect(isAppDayRequired(fixed, "2026-09-15")).toBe(false);
  });

  it("allows proof on any day for daily and floating schedules", () => {
    expect(isAppDayRequired(daily, "2026-09-15")).toBe(true);
    expect(isAppDayRequired(floating, "2026-09-15")).toBe(true);
  });
});

describe("calculateRunStats for daily commitments", () => {
  it("keeps the existing run while today's proof is unresolved", () => {
    const result = calculateRunStats({
      schedule: daily,
      startDate: "2026-09-12",
      today: "2026-09-15",
      proofs: [
        proof("2026-09-12"),
        proof("2026-09-13"),
        proof("2026-09-14"),
        proof("2026-09-15", "waiting"),
      ],
    });

    expect(result).toMatchObject({
      currentRun: 3,
      bestRun: 3,
      bestRunBeforeCurrent: 0,
      unit: "day",
    });
  });

  it("does not let an unsubmitted current day break the run", () => {
    const result = calculateRunStats({
      schedule: daily,
      startDate: "2026-09-12",
      today: "2026-09-15",
      proofs: [proof("2026-09-12"), proof("2026-09-13"), proof("2026-09-14")],
    });

    expect(result.currentRun).toBe(3);
  });

  it("stops at the first missing elapsed required day", () => {
    const result = calculateRunStats({
      schedule: daily,
      startDate: "2026-09-10",
      today: "2026-09-15",
      proofs: [
        proof("2026-09-10"),
        proof("2026-09-11"),
        proof("2026-09-12"),
        proof("2026-09-14"),
      ],
    });

    expect(result).toMatchObject({
      currentRun: 1,
      bestRun: 3,
      bestRunBeforeCurrent: 3,
    });
  });

  it("records the run that an explicit broken proof ended", () => {
    const result = calculateRunStats({
      schedule: daily,
      startDate: "2026-09-12",
      today: "2026-09-15",
      proofs: [
        proof("2026-09-12"),
        proof("2026-09-13"),
        proof("2026-09-14"),
        proof("2026-09-15", "broken"),
      ],
    });

    expect(result).toMatchObject({
      currentRun: 0,
      bestRun: 3,
      bestRunBeforeCurrent: 3,
      lastBreak: { appDay: "2026-09-15", runLength: 3 },
    });
  });

  it("starts a new run when a broken day is successfully re-posted", () => {
    const result = calculateRunStats({
      schedule: daily,
      startDate: "2026-09-12",
      today: "2026-09-15",
      proofs: [
        proof("2026-09-12"),
        proof("2026-09-13"),
        proof("2026-09-14"),
        proof("2026-09-15", "broken"),
        proof("2026-09-15", "backed"),
      ],
    });

    expect(result).toMatchObject({
      currentRun: 1,
      bestRun: 3,
      bestRunBeforeCurrent: 3,
      lastBreak: { appDay: "2026-09-15", runLength: 3 },
    });
  });
});

describe("calculateRunStats for fixed weekdays", () => {
  it("skips rest days without breaking or extending the run", () => {
    const result = calculateRunStats({
      schedule: fixed,
      startDate: "2026-09-04",
      today: "2026-09-14",
      proofs: [
        proof("2026-09-04", "broken"),
        proof("2026-09-07"),
        proof("2026-09-09"),
        proof("2026-09-11"),
        proof("2026-09-14", "waiting"),
      ],
    });

    expect(result).toMatchObject({ currentRun: 3, bestRun: 3, unit: "day" });
  });
});

describe("calculateRunStats for floating weekly commitments", () => {
  it("counts consecutive completed weeks that meet quota", () => {
    const result = calculateRunStats({
      schedule: floating,
      startDate: "2026-08-31",
      today: "2026-09-14",
      proofs: [
        proof("2026-08-31"),
        proof("2026-09-02"),
        proof("2026-09-06"),
        proof("2026-09-07"),
        proof("2026-09-09"),
        proof("2026-09-13"),
      ],
    });

    expect(result).toMatchObject({
      currentRun: 2,
      bestRun: 2,
      bestRunBeforeCurrent: 0,
      unit: "week",
    });
  });

  it("lets a week hit quota on its final day", () => {
    const result = calculateRunStats({
      schedule: floating,
      startDate: "2026-09-07",
      today: "2026-09-14",
      proofs: [proof("2026-09-07"), proof("2026-09-09"), proof("2026-09-13")],
    });

    expect(result.currentRun).toBe(1);
  });

  it("breaks the run when a completed week falls one short", () => {
    const result = calculateRunStats({
      schedule: floating,
      startDate: "2026-08-24",
      today: "2026-09-14",
      proofs: [
        proof("2026-08-24"),
        proof("2026-08-26"),
        proof("2026-08-30"),
        proof("2026-08-31"),
        proof("2026-09-02"),
        proof("2026-09-06"),
        proof("2026-09-07"),
        proof("2026-09-13"),
      ],
    });

    expect(result).toMatchObject({
      currentRun: 0,
      bestRun: 2,
      bestRunBeforeCurrent: 2,
      lastBreak: { appDay: "2026-09-13", runLength: 2 },
    });
  });

  it("never evaluates the current in-progress week", () => {
    const result = calculateRunStats({
      schedule: floating,
      startDate: "2026-08-31",
      today: "2026-09-13",
      proofs: [
        proof("2026-08-31"),
        proof("2026-09-02"),
        proof("2026-09-06"),
        proof("2026-09-07"),
      ],
    });

    expect(result.currentRun).toBe(1);
  });

  it("starts evaluation on the first full Monday-to-Sunday week", () => {
    const result = calculateRunStats({
      schedule: floating,
      startDate: "2026-09-02",
      today: "2026-09-21",
      proofs: [
        proof("2026-09-02"),
        proof("2026-09-03"),
        proof("2026-09-04"),
        proof("2026-09-07"),
        proof("2026-09-09"),
        proof("2026-09-13"),
        proof("2026-09-14"),
        proof("2026-09-16"),
        proof("2026-09-20"),
      ],
    });

    expect(result.currentRun).toBe(2);
  });
});
