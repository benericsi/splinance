import { fromIsoDate } from '@/features/transactions/dates';

const monthDate = (month: string) => fromIsoDate(`${month}-01`);

/** "Oct", for chart axes. */
export function shortMonth(month: string): string {
  return monthDate(month).toLocaleDateString('en-GB', { month: 'short' });
}

/** "May – Oct 2026", or "Nov 2025 – Apr 2026" across a new year. */
export function formatMonthRange(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = monthDate(from).toLocaleDateString('en-GB', {
    month: 'short',
    ...(!sameYear && { year: 'numeric' }),
  });
  const end = monthDate(to).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

// en-US: "120K", "1.3M" (en-GB writes a lowercase "1.3m").
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "120K", for axis ticks (major units). */
export const compactNumber = (value: number) => compact.format(value);
