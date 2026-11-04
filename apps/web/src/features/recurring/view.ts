import {
  nextDueOn,
  priceChange,
  type RecurringCadence,
  type RecurringSeries,
  type SeriesTiming,
  seriesTiming,
} from '@splinance/shared';
import { fromIsoDate } from '@/features/transactions/dates';

export const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

/** A series with what the page derives from it on the viewer's `today`. */
export interface SeriesView {
  series: RecurringSeries;
  nextOn: string;
  timing: SeriesTiming;
  daysUntil: number;
  /** Latest payment vs the one before, when it changed by more than 2%. */
  change: number | null;
  /** The viewer's part of the monthly amount (their share of a shared payment). */
  yourMonthly: number;
}

/**
 * Next payment, timing and the viewer's monthly part, from the browser's date (the API is
 * time zone free). A shared series without a payment yet has no known share: split evenly.
 */
export function viewSeries(
  series: RecurringSeries,
  today: string,
  memberCount: number,
): SeriesView {
  const nextOn = nextDueOn(series, series.lastPaidOn, today);
  const { timing, daysUntil } = seriesTiming(nextOn, series.cadence, today);
  const yourMonthly =
    series.scope === 'private'
      ? series.monthlyAmount
      : series.share !== null
        ? Math.round((series.monthlyAmount * series.share) / series.latestAmount)
        : Math.round(series.monthlyAmount / Math.max(1, memberCount));
  return {
    series,
    nextOn,
    timing,
    daysUntil,
    change: priceChange(series.latestAmount, series.previousAmount),
    yourMonthly,
  };
}

/** "7 Nov", with the year when it is not this year. */
export function shortDate(value: string, now = new Date()): string {
  const date = fromIsoDate(value);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

/** When the next payment is, in words: "due today", "due tomorrow", "due in 3 days", "due 12 Nov", "2 days late". */
export function dueLabel(view: Pick<SeriesView, 'nextOn' | 'daysUntil'>): string {
  const { daysUntil, nextOn } = view;
  if (daysUntil < 0) return `${String(-daysUntil)} ${daysUntil === -1 ? 'day' : 'days'} late`;
  if (daysUntil === 0) return 'due today';
  if (daysUntil === 1) return 'due tomorrow';
  if (daysUntil <= 6) return `due in ${String(daysUntil)} days`;
  return `due ${shortDate(nextOn)}`;
}

/** "+11%", "-5%" */
export const formatChange = (change: number) =>
  `${change > 0 ? '+' : '-'}${String(Math.round(Math.abs(change) * 100))}%`;
