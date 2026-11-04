import type { RecurringCadence } from './schemas';

/**
 * Calendar arithmetic for recurring payments, on `YYYY-MM-DD` strings in UTC (dates, not
 * moments: no time zone can move them across midnight).
 */

const DAY_MS = 86_400_000;

function toEpochDay(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to` (negative when `to` comes first). */
export function daysBetween(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from);
}

function plusDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days);
}

const MONTHS_PER_PERIOD: Record<Exclude<RecurringCadence, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Average length of a period in days: only for estimating, never for dates. */
export const PERIOD_DAYS: Record<RecurringCadence, number> = {
  weekly: 7,
  monthly: 30.44,
  quarterly: 91.31,
  yearly: 365.25,
};

/**
 * How late a payment may be before the series counts as stopped. Banks post card payments
 * a few days late, and a yearly renewal can move by weeks.
 */
export const GRACE_DAYS: Record<RecurringCadence, number> = {
  weekly: 3,
  monthly: 7,
  quarterly: 14,
  yearly: 30,
};

/** "Coming up" on the Overview and the page: due within this many days. */
export const COMING_UP_DAYS = 7;

/**
 * The `index`-th payment date counted from `anchorOn` (0 is the anchor itself, negative
 * counts back). Months keep the anchor's day where the month has it: an anchor on the 31st
 * gives 30 April, 28 February, then 31 March again, never drifting to the 28th.
 */
export function occurrence(anchorOn: string, cadence: RecurringCadence, index: number): string {
  if (cadence === 'weekly') return plusDays(anchorOn, 7 * index);
  const [year = 1970, month = 1, day = 1] = anchorOn.split('-').map(Number);
  const total = year * 12 + (month - 1) + index * MONTHS_PER_PERIOD[cadence];
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromEpochDay(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)) / DAY_MS);
}

/** The index of the payment date closest to `date` (payments drift by a few days). */
export function nearestOccurrenceIndex(
  anchorOn: string,
  cadence: RecurringCadence,
  date: string,
): number {
  const estimate = Math.round(daysBetween(anchorOn, date) / PERIOD_DAYS[cadence]);
  let best = estimate;
  for (const index of [estimate - 1, estimate + 1]) {
    const distance = Math.abs(daysBetween(occurrence(anchorOn, cadence, index), date));
    if (distance < Math.abs(daysBetween(occurrence(anchorOn, cadence, best), date))) {
      best = index;
    }
  }
  return best;
}

/**
 * When the next payment is expected. After the latest payment found, it is the following
 * date in the series' rhythm. With no payment found yet, `anchorOn` is a date the person
 * entered: a future one is the next payment itself, a past one counts as the last payment.
 */
export function nextDueOn(
  series: { anchorOn: string; cadence: RecurringCadence },
  lastPaidOn: string | null,
  today: string,
): string {
  const { anchorOn, cadence } = series;
  if (lastPaidOn === null && anchorOn > today) return anchorOn;
  const last = lastPaidOn ?? anchorOn;
  return occurrence(anchorOn, cadence, nearestOccurrenceIndex(anchorOn, cadence, last) + 1);
}

export type SeriesTiming = 'lapsed' | 'due' | 'soon' | 'later';

/**
 * Where a series stands on `today`: `lapsed` (the expected payment is more than the grace
 * window late: cancelled?), `due` (expected today or a little late), `soon` (within
 * `COMING_UP_DAYS`), `later`.
 */
export function seriesTiming(
  nextOn: string,
  cadence: RecurringCadence,
  today: string,
): { timing: SeriesTiming; daysUntil: number } {
  const daysUntil = daysBetween(today, nextOn);
  const timing: SeriesTiming =
    daysUntil < -GRACE_DAYS[cadence]
      ? 'lapsed'
      : daysUntil <= 0
        ? 'due'
        : daysUntil <= COMING_UP_DAYS
          ? 'soon'
          : 'later';
  return { timing, daysUntil };
}

/** What a payment costs per month on average, in minor units (rounded). */
export function monthlyAmount(amount: number, cadence: RecurringCadence): number {
  switch (cadence) {
    case 'weekly':
      return Math.round((amount * 52) / 12);
    case 'monthly':
      return amount;
    case 'quarterly':
      return Math.round(amount / 3);
    case 'yearly':
      return Math.round(amount / 12);
  }
}

/** Below this relative difference a new amount is not called a price change (rounding, FX). */
export const PRICE_CHANGE_THRESHOLD = 0.02;

/** The relative change from the previous to the latest payment, or null when negligible. */
export function priceChange(latest: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  const change = (latest - previous) / previous;
  return Math.abs(change) > PRICE_CHANGE_THRESHOLD ? change : null;
}
