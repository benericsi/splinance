import { matchKey } from '../rules';
import type { TransactionKind, TransactionVisibility } from '../transactions';

/** What matching and detection read of a transaction (live rows only: callers drop deleted ones). */
export interface RecurringRow {
  id: string;
  kind: TransactionKind;
  visibility: TransactionVisibility;
  createdBy: string;
  amount: number;
  occurredOn: string;
  counterparty: string | null;
  description: string;
  categoryId: string | null;
}

/** What matching needs of a series. */
export interface SeriesMatcher {
  id: string;
  kind: TransactionKind;
  /** Null for a shared series; the owner of a private one. */
  ownerId: string | null;
  pattern: string;
  /** The expected amount. */
  amount: number;
  amountVaries: boolean;
  startsOn: string | null;
}

/** How far a payment may be from the one after it (or the expected amount) and still count. */
export const AMOUNT_TOLERANCE = 0.25;
/** The same for series marked "amount varies" (gas and electricity swing with the seasons). */
export const VARYING_AMOUNT_TOLERANCE = 0.6;

export function withinTolerance(amount: number, reference: number, tolerance: number): boolean {
  return Math.abs(amount - reference) <= reference * tolerance;
}

/**
 * Whether a transaction could be one of the series' payments, before amounts are compared:
 * same kind, on or after the series' start, the pattern in the counterparty or the
 * description (as rules match), and in scope. A shared series only ever matches shared
 * transactions, so it can never show someone's private row to the household; a private
 * series matches what its owner can see (their own private rows and shared ones).
 */
export function seriesCovers(series: SeriesMatcher, row: RecurringRow): boolean {
  if (series.kind !== row.kind) return false;
  if (series.startsOn !== null && row.occurredOn < series.startsOn) return false;
  const inScope =
    series.ownerId === null
      ? row.visibility === 'shared'
      : row.visibility === 'shared' || row.createdBy === series.ownerId;
  if (!inScope) return false;
  const needle = matchKey(series.pattern);
  if (needle === '') return false;
  return [row.counterparty, row.description].some(
    (text) => text !== null && matchKey(text).includes(needle),
  );
}

/**
 * The payments of a series among the transactions it covers: walking back from the newest,
 * each must be within the tolerance of the one after it, the newest within the tolerance of
 * the expected amount. So a price rise carries the series along (4 490 -> 4 990), while a
 * different purchase at the same merchant (a one-off 25 000 at the same shop) does not join.
 */
export function seriesPayments<T extends RecurringRow>(
  series: Pick<SeriesMatcher, 'amount' | 'amountVaries'>,
  covered: readonly T[],
): T[] {
  const tolerance = series.amountVaries ? VARYING_AMOUNT_TOLERANCE : AMOUNT_TOLERANCE;
  const payments: T[] = [];
  let reference = series.amount;
  for (const row of [...covered].sort(newestFirst)) {
    if (!withinTolerance(row.amount, reference, tolerance)) continue;
    payments.push(row);
    reference = row.amount;
  }
  return payments;
}

const newestFirst = (a: RecurringRow, b: RecurringRow) =>
  b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id);

/**
 * Gives each transaction to at most one series and returns every series' payments, newest
 * first, plus the transactions no series' text covers (what detection looks at). When two series
 * cover a transaction (patterns "apple" and "apple music"), the longer pattern wins, then
 * the series that comes first in `series` (pass them oldest first).
 */
export function assignPayments<T extends RecurringRow>(
  series: readonly SeriesMatcher[],
  rows: readonly T[],
): { payments: Map<string, T[]>; unowned: T[] } {
  const ranked = series
    .map((item, order) => ({ item, order, length: matchKey(item.pattern).length }))
    .sort((a, b) => b.length - a.length || a.order - b.order)
    .map(({ item }) => item);

  const covered = new Map<string, T[]>(series.map((item) => [item.id, []]));
  const unowned: T[] = [];
  for (const row of rows) {
    const owner = ranked.find((item) => seriesCovers(item, row));
    if (owner) covered.get(owner.id)?.push(row);
    else unowned.push(row);
  }

  // A row the series' text covers but its amounts refuse is no payment of it, and it does
  // not go to detection either: the merchant already has a series, so suggesting another one
  // for it would only repeat it.
  const payments = new Map<string, T[]>();
  for (const item of series)
    payments.set(item.id, seriesPayments(item, covered.get(item.id) ?? []));
  return { payments, unowned };
}
