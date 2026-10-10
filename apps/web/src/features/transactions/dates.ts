/**
 * Calendar dates (`YYYY-MM-DD`) and months (`YYYY-MM`) in the user's local time zone. Built
 * from parts, never through `new Date('2026-10-10')`, which would mean midnight UTC and show
 * the previous day west of Greenwich.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIsoDate(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export const today = (now = new Date()) => toIsoDate(now);

export const currentMonth = (now = new Date()) => toIsoDate(now).slice(0, 7);

/** `addMonths('2026-01', -1)` is `'2025-12'`. */
export function addMonths(month: string, delta: number): string {
  const [year = 1970, index = 1] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return toIsoDate(date).slice(0, 7);
}

/** "October 2026" */
export function formatMonth(month: string): string {
  return fromIsoDate(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "Today, Fri 10 Oct", "Yesterday, Thu 9 Oct", "Wed 8 Oct", or with the year if not this year. */
export function formatDayHeading(value: string, now = new Date()): string {
  const date = fromIsoDate(value);
  const dayMonth = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  // Appended by hand: with `year`, en-GB adds a comma after the weekday ("Wed, 31 Dec 2025").
  const label =
    date.getFullYear() === now.getFullYear()
      ? dayMonth
      : `${dayMonth} ${String(date.getFullYear())}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (value === toIsoDate(now)) return `Today, ${label}`;
  if (value === toIsoDate(yesterday)) return `Yesterday, ${label}`;
  return label;
}
