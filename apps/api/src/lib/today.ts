/**
 * Where "today" is decided on the server: Budapest, until people get their own time zone
 * (Phase 7). Detection drops rhythms that stopped by it; the demo story ends on it.
 */
export const APP_TIME_ZONE = 'Europe/Budapest';

/** Today (`YYYY-MM-DD`) in `APP_TIME_ZONE`. */
export function budapestToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(now);
}
