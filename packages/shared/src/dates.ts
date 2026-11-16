/**
 * Calendar arithmetic on `YYYY-MM-DD` strings in UTC (dates, not moments: no time zone can
 * move them across midnight). One home for what the API, the web, the recurring logic and
 * the demo story share; never local-time `Date`s.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Days since 1970-01-01. */
export function dayNumber(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** The date `days` later (earlier when negative). */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to` (negative when `to` comes first). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}
