import { z } from "zod";

import {
  addAppDays,
  differenceInAppDays,
  getAppDayWeekday,
} from "./appDay";

const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((weekdays) => new Set(weekdays).size === weekdays.length, {
    message: "Weekdays must be unique",
  });

export const habitScheduleSchema = z.discriminatedUnion("schedule_type", [
  z
    .object({
      schedule_type: z.literal("daily"),
      schedule_config: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      schedule_type: z.literal("weekdays_fixed"),
      schedule_config: z
        .object({
          weekdays: weekdaysSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      schedule_type: z.literal("days_per_week_floating"),
      schedule_config: z
        .object({
          days_per_week: z.number().int().min(1).max(6),
        })
        .strict(),
    })
    .strict(),
]);

export type HabitSchedule = z.infer<typeof habitScheduleSchema>;

export interface StreakProof {
  appDay: string;
  status: "waiting" | "backed" | "broken";
}

export interface RunBreak {
  appDay: string;
  runLength: number;
}

export interface RunStats {
  currentRun: number;
  bestRun: number;
  bestRunBeforeCurrent: number;
  lastBreak: RunBreak | null;
  unit: "day" | "week";
}

interface CalculateRunStatsInput {
  schedule: HabitSchedule;
  startDate: string;
  today: string;
  proofs: readonly StreakProof[];
}

interface DayState {
  activeStatus: "waiting" | "backed" | null;
  hadBrokenProof: boolean;
}

function buildDayStates(proofs: readonly StreakProof[]) {
  const states = new Map<string, DayState>();

  for (const proof of proofs) {
    // Validate every date even if it falls outside the requested range.
    differenceInAppDays(proof.appDay, proof.appDay);

    const state = states.get(proof.appDay) ?? {
      activeStatus: null,
      hadBrokenProof: false,
    };

    if (proof.status === "broken") {
      state.hadBrokenProof = true;
    } else if (proof.status === "backed") {
      state.activeStatus = "backed";
    } else if (state.activeStatus !== "backed") {
      state.activeStatus = "waiting";
    }

    states.set(proof.appDay, state);
  }

  return states;
}

function calculateDayBasedRunStats(
  input: CalculateRunStatsInput,
  requiredWeekdays: ReadonlySet<number> | null,
): RunStats {
  const { startDate, today } = input;
  const states = buildDayStates(input.proofs);
  const totalDays = differenceInAppDays(startDate, today);

  if (totalDays < 0) {
    return {
      currentRun: 0,
      bestRun: 0,
      bestRunBeforeCurrent: 0,
      lastBreak: null,
      unit: "day",
    };
  }

  let currentRun = 0;
  let bestRun = 0;
  let bestCompletedRun = 0;
  let lastBreak: RunBreak | null = null;

  const finishRun = (appDay: string) => {
    if (currentRun > 0) {
      bestCompletedRun = Math.max(bestCompletedRun, currentRun);
      lastBreak = { appDay, runLength: currentRun };
    }
    currentRun = 0;
  };

  for (let offset = 0; offset <= totalDays; offset += 1) {
    const appDay = addAppDays(startDate, offset);
    const isRequired =
      requiredWeekdays === null || requiredWeekdays.has(getAppDayWeekday(appDay));

    if (!isRequired) {
      continue;
    }

    const state = states.get(appDay) ?? {
      activeStatus: null,
      hadBrokenProof: false,
    };

    if (state.hadBrokenProof) {
      finishRun(appDay);
    }

    if (state.activeStatus === "backed") {
      currentRun += 1;
      bestRun = Math.max(bestRun, currentRun);
      continue;
    }

    const isOpenCurrentDay =
      appDay === today &&
      !state.hadBrokenProof &&
      (state.activeStatus === "waiting" || state.activeStatus === null);

    if (!isOpenCurrentDay && !state.hadBrokenProof) {
      finishRun(appDay);
    }
  }

  return {
    currentRun,
    bestRun,
    bestRunBeforeCurrent: bestCompletedRun,
    lastBreak,
    unit: "day",
  };
}

function startOfMondayWeek(appDay: string) {
  const weekday = getAppDayWeekday(appDay);
  const daysSinceMonday = (weekday + 6) % 7;
  return addAppDays(appDay, -daysSinceMonday);
}

function firstFullWeekStart(startDate: string) {
  const weekStart = startOfMondayWeek(startDate);
  return weekStart === startDate ? weekStart : addAppDays(weekStart, 7);
}

function calculateFloatingRunStats(
  input: CalculateRunStatsInput,
  quota: number,
): RunStats {
  const states = buildDayStates(input.proofs);
  const firstWeek = firstFullWeekStart(input.startDate);
  const currentWeek = startOfMondayWeek(input.today);
  const completedWeekCount = Math.max(0, differenceInAppDays(firstWeek, currentWeek) / 7);
  let currentRun = 0;
  let bestRun = 0;
  let bestCompletedRun = 0;
  let lastBreak: RunBreak | null = null;

  for (let weekOffset = 0; weekOffset < completedWeekCount; weekOffset += 1) {
    const weekStart = addAppDays(firstWeek, weekOffset * 7);
    const backedDays = new Set<string>();

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const appDay = addAppDays(weekStart, dayOffset);
      if (states.get(appDay)?.activeStatus === "backed") {
        backedDays.add(appDay);
      }
    }

    if (backedDays.size >= quota) {
      currentRun += 1;
      bestRun = Math.max(bestRun, currentRun);
      continue;
    }

    if (currentRun > 0) {
      bestCompletedRun = Math.max(bestCompletedRun, currentRun);
      lastBreak = {
        appDay: addAppDays(weekStart, 6),
        runLength: currentRun,
      };
    }
    currentRun = 0;
  }

  return {
    currentRun,
    bestRun,
    bestRunBeforeCurrent: bestCompletedRun,
    lastBreak,
    unit: "week",
  };
}

export function calculateRunStats(input: CalculateRunStatsInput): RunStats {
  const schedule = habitScheduleSchema.parse(input.schedule);
  const normalizedInput = { ...input, schedule };

  if (schedule.schedule_type === "daily") {
    return calculateDayBasedRunStats(normalizedInput, null);
  }

  if (schedule.schedule_type === "weekdays_fixed") {
    return calculateDayBasedRunStats(
      normalizedInput,
      new Set(schedule.schedule_config.weekdays),
    );
  }

  return calculateFloatingRunStats(
    normalizedInput,
    schedule.schedule_config.days_per_week,
  );
}

export function isAppDayRequired(scheduleInput: HabitSchedule, appDay: string) {
  const schedule = habitScheduleSchema.parse(scheduleInput);

  if (schedule.schedule_type === "weekdays_fixed") {
    return schedule.schedule_config.weekdays.includes(getAppDayWeekday(appDay));
  }

  return true;
}
