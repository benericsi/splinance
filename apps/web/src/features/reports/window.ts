import { addMonths } from '@splinance/shared';

/** How many months the trend shows. */
export const REPORT_WINDOW_MONTHS = 6;

export interface ReportWindow {
  from: string;
  to: string;
  /** The month the category breakdown shows; always inside the window. */
  month: string;
}

/**
 * The trend's months and the selected one, from `?to=` (the window's last month, default
 * the current one) and `?month=` (default `to`). A selected month outside the window moves
 * the window so that it ends there, so stepping month by month never loses the selection.
 */
export function reportWindow(
  { to, month }: { to?: string | undefined; month?: string | undefined },
  current: string,
): ReportWindow {
  let end = to ?? current;
  const selected = month ?? end;
  if (selected > end || selected < addMonths(end, 1 - REPORT_WINDOW_MONTHS)) end = selected;
  return { from: addMonths(end, 1 - REPORT_WINDOW_MONTHS), to: end, month: selected };
}

export type ReportRange =
  ({ period: 'month' } & ReportWindow) | { period: 'year'; from: string; to: string; year: string };

/**
 * What the reports page shows: six months around a selected one (`reportWindow`), or a
 * whole calendar year (`?period=year&year=YYYY`, default the selected month's year) whose
 * twelve months the trend shows and whose categories are added up.
 */
export function reportRange(
  search: {
    period?: 'month' | 'year' | undefined;
    year?: string | undefined;
    to?: string | undefined;
    month?: string | undefined;
  },
  current: string,
): ReportRange {
  if (search.period !== 'year') return { period: 'month', ...reportWindow(search, current) };
  const year = search.year ?? (search.month ?? search.to ?? current).slice(0, 4);
  return { period: 'year', from: `${year}-01`, to: `${year}-12`, year };
}

/**
 * What to fetch for a range: one month more for a month's "vs last month", the whole
 * year before for a year's "vs last year". Charts show only `range` itself.
 */
export function fetchRange(range: ReportRange): { from: string; to: string } {
  const from =
    range.period === 'year' ? `${String(Number(range.year) - 1)}-01` : addMonths(range.from, -1);
  return { from, to: range.to };
}
