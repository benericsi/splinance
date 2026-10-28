/** Today (`YYYY-MM-DD`) in Budapest, where the demo household lives. */
export function budapestToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(now);
}
