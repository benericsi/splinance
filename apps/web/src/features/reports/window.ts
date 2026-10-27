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
