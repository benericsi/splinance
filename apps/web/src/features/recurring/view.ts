import {
  nextDueOn,
  priceChange,
  type RecurringCadence,
  type RecurringSeries,
  type SeriesTiming,
  seriesTiming,
  type TransactionKind,
} from '@splinance/shared';
import { formatDateWith, fromIsoDate } from '@/features/transactions/dates';
import { i18n } from '@/i18n';

/** "Monthly", "Every 3 months", in the UI language. */
export const cadenceLabel = (cadence: RecurringCadence) => i18n.t(`recurring:cadence.${cadence}`);

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
  return formatDateWith(date, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

/**
 * When the next payment is, in words: "due today", "due tomorrow", "due in 3 days",
 * "due 12 Nov", "2 days late". Income is expected, not due: "expected today".
 */
export function dueLabel(
  view: Pick<SeriesView, 'nextOn' | 'daysUntil'>,
  kind: TransactionKind = 'expense',
): string {
  const { daysUntil, nextOn } = view;
  const words = kind === 'income' ? 'expected' : 'due';
  if (daysUntil < 0) return i18n.t('recurring:due.late', { count: -daysUntil });
  if (daysUntil === 0) return i18n.t(`recurring:${words}.today`);
  if (daysUntil === 1) return i18n.t(`recurring:${words}.tomorrow`);
  if (daysUntil <= 6) return i18n.t(`recurring:${words}.inDays`, { count: daysUntil });
  return i18n.t(`recurring:${words}.on`, { date: shortDate(nextOn) });
}

/** "+690 000 Ft" for income, the plain amount for a payment. */
export const signFor = (kind: TransactionKind) => (kind === 'income' ? '+' : '');

/** "+11%", "-5%" */
export const formatChange = (change: number) =>
  `${change > 0 ? '+' : '-'}${String(Math.round(Math.abs(change) * 100))}%`;

/**
 * The overview's "Coming up": the soonest payment due or income expected within a week
 * (or a few days late), and how many more there are in that window.
 */
export function comingUp(
  series: readonly RecurringSeries[],
  today: string,
  memberCount: number,
): { next: SeriesView | null; more: number } {
  const upcoming = series
    .map((one) => viewSeries(one, today, memberCount))
    .filter((view) => view.timing === 'due' || view.timing === 'soon')
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return { next: upcoming[0] ?? null, more: Math.max(0, upcoming.length - 1) };
}
