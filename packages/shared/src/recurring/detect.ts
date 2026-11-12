import { daysBetween, GRACE_DAYS, monthlyAmount, nextDueOn } from './dates';
import { recurringKey } from './keys';
import { AMOUNT_TOLERANCE, type RecurringRow, withinTolerance } from './match';
import { RECURRING_CADENCES, type RecurringCadence, type RecurringScope } from './schemas';
import type { TransactionKind } from '../transactions';

/**
 * Finding recurring payments and income nobody has told us about: transactions of one kind
 * at the same merchant (or from the same payer) in a steady rhythm with similar amounts. Pure; the caller passes the transactions the
 * viewer can see that no series owns (see `assignPayments`) and filters out dismissed keys.
 */

/** Days between two payments that fit a cadence, and the same with one payment missing. */
const INTERVALS: Record<
  RecurringCadence,
  { one: [number, number]; skipped: [number, number] | null }
> = {
  weekly: { one: [6, 8], skipped: [13, 15] },
  monthly: { one: [26, 35], skipped: [56, 66] },
  quarterly: { one: [85, 97], skipped: [175, 190] },
  yearly: { one: [350, 380], skipped: null },
};

/**
 * Payments needed before a rhythm counts. Weekly needs four: three weekly shops with
 * similar totals happen by chance. Quarterly needs three: two payments three months apart
 * are also what a paused monthly one leaves. A year of history holds two yearly ones at most.
 */
export const MIN_OCCURRENCES: Record<RecurringCadence, number> = {
  weekly: 4,
  monthly: 3,
  quarterly: 3,
  yearly: 2,
};

/** Above this spread (relative to the median) the amount is shown as varying. */
const VARIES_ABOVE = 0.05;

export interface DetectedSeries {
  key: string;
  scope: RecurringScope;
  kind: TransactionKind;
  /** The private author; null for shared. */
  ownerId: string | null;
  cadence: RecurringCadence;
  /** The latest payment. */
  amount: number;
  previousAmount: number | null;
  amountVaries: boolean;
  firstOn: string;
  lastOn: string;
  occurrences: number;
  description: string;
  categoryId: string | null;
  monthlyAmount: number;
  /** The payments, newest first (at most 12). */
  transactionIds: string[];
}

const fits = (days: number, [low, high]: [number, number]) => days >= low && days <= high;

/**
 * The longest run of payments ending with the newest one in this cadence: walking back,
 * each gap fits the cadence (one missed payment allowed) and each amount is within 25% of
 * the one after it.
 */
function trailingRun<T extends RecurringRow>(oldestFirst: readonly T[], cadence: RecurringCadence) {
  const { one, skipped } = INTERVALS[cadence];
  const newest = oldestFirst.at(-1);
  if (!newest) return [];
  const run = [newest];
  let missedOne = false;
  for (let index = oldestFirst.length - 2; index >= 0; index--) {
    const row = oldestFirst[index];
    const next = run.at(-1);
    if (!row || !next) break;
    const gap = daysBetween(row.occurredOn, next.occurredOn);
    if (fits(gap, one)) {
      // In rhythm.
    } else if (!missedOne && skipped && fits(gap, skipped)) {
      missedOne = true;
    } else {
      break;
    }
    if (!withinTolerance(row.amount, next.amount, AMOUNT_TOLERANCE)) break;
    run.push(row);
  }
  return run;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Recurring expenses and income among `rows`, largest per month first. Groups never mix an
 * expense with an income (a refund from a shop is no payment to it), a shared transaction
 * with a private one, or two people's private ones, so a suggestion only ever reaches
 * people who can see all of it. A rhythm that stopped (its next payment is
 * past the grace window on `today`) is no suggestion: probably cancelled.
 */
export function detectRecurring(
  rows: readonly RecurringRow[],
  { today }: { today: string },
): DetectedSeries[] {
  const groups = new Map<string, RecurringRow[]>();
  for (const row of rows) {
    const key = recurringKey(row);
    if (key.length < 2) continue;
    const scope = row.visibility === 'shared' ? 'shared' : `private:${row.createdBy}`;
    const groupKey = `${scope}:${row.kind}\u0000${key}`;
    const group = groups.get(groupKey);
    if (group) group.push(row);
    else groups.set(groupKey, [row]);
  }

  const found: DetectedSeries[] = [];
  for (const [groupKey, group] of groups) {
    const key = groupKey.slice(groupKey.indexOf('\u0000') + 1);
    group.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id));

    let best: { cadence: RecurringCadence; run: RecurringRow[] } | null = null;
    for (const cadence of RECURRING_CADENCES) {
      const run = trailingRun(group, cadence);
      if (run.length < MIN_OCCURRENCES[cadence]) continue;
      if (!best || run.length > best.run.length) best = { cadence, run };
    }
    if (!best) continue;

    const { cadence, run } = best;
    const [newest, previous] = run;
    const oldest = run.at(-1);
    if (!newest || !oldest) continue;
    const next = nextDueOn({ anchorOn: newest.occurredOn, cadence }, newest.occurredOn, today);
    if (daysBetween(next, today) > GRACE_DAYS[cadence]) continue;

    const amounts = run.map((row) => row.amount);
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / median(amounts);
    found.push({
      key,
      scope: newest.visibility === 'shared' ? 'shared' : 'private',
      kind: newest.kind,
      ownerId: newest.visibility === 'shared' ? null : newest.createdBy,
      cadence,
      amount: newest.amount,
      previousAmount: previous?.amount ?? null,
      amountVaries: spread > VARIES_ABOVE,
      firstOn: oldest.occurredOn,
      lastOn: newest.occurredOn,
      occurrences: run.length,
      description: newest.description,
      categoryId: newest.categoryId,
      monthlyAmount: monthlyAmount(newest.amount, cadence),
      transactionIds: run.slice(0, 12).map((row) => row.id),
    });
  }
  return found.sort((a, b) => b.monthlyAmount - a.monthlyAmount || a.key.localeCompare(b.key));
}
