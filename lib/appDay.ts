export const PILOT_TIME_ZONE = "America/New_York";
const APP_DAY_BOUNDARY_HOUR = 4;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const localDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PILOT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function formatDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseAppDay(appDay: string) {
  if (!ISO_DATE_PATTERN.test(appDay)) {
    throw new RangeError(`Invalid app day: ${appDay}`);
  }

  const [year, month, day] = appDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid app day: ${appDay}`);
  }

  return date;
}

/**
 * Returns the pilot's YYYY-MM-DD app-day label for an absolute timestamp.
 *
 * The boundary is 4am in America/New_York. We inspect local wall-clock parts instead of
 * subtracting four absolute hours, because an absolute subtraction is wrong across DST changes.
 */
export function getAppDay(utcTimestamp: Date): string {
  if (Number.isNaN(utcTimestamp.getTime())) {
    throw new RangeError("Invalid timestamp");
  }

  const parts = Object.fromEntries(
    localDateTimeFormatter
      .formatToParts(utcTimestamp)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );

  const localDate = formatDate(parts.year, parts.month, parts.day);
  return parts.hour < APP_DAY_BOUNDARY_HOUR
    ? addAppDays(localDate, -1)
    : localDate;
}

export function addAppDays(appDay: string, amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError("App-day offset must be an integer");
  }

  const date = parseAppDay(appDay);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function differenceInAppDays(start: string, end: string): number {
  const startDate = parseAppDay(start);
  const endDate = parseAppDay(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

export function getPilotWeekNumber(startDate: string, appDay: string): number {
  return Math.min(4, Math.max(1, Math.floor(differenceInAppDays(startDate, appDay) / 7) + 1));
}

export function getAppDayWeekday(appDay: string): number {
  return parseAppDay(appDay).getUTCDay();
}

export function formatAppDayWeekday(appDay: string, format: "long" | "short" = "long") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: format,
  }).format(parseAppDay(appDay));
}
