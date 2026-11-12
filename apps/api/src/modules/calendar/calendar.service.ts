import {
  type Calendar,
  type CalendarDay,
  type CalendarEvent,
  type CalendarQuery,
  daysOfMonth,
  lastCalendarMonth,
  nearestOccurrenceIndex,
  nextDueOn,
  occurrence,
  seriesTiming,
} from '@splinance/shared';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { transactions, transactionSplits } from '../../db/schema';
import { monthRange } from '../../lib/months';
import { budapestToday } from '../../lib/today';
import { requireMembership } from '../households/households.service';
import { seriesWithPayments, sharesOf } from '../recurring/recurring.service';
import { ownSplit, yourPart } from '../reports/reports.service';
import { settlementsBetween } from '../settlements/settlements.service';
import { type HouseholdScope, visibleTo } from '../transactions/transactions.service';

interface Options {
  /** `YYYY-MM-DD`; Budapest today by default (tests pin it). */
  today?: string;
}

/** Totals per day of what the viewer sees, and their own part of it (like a report month). */
async function dayTotals(
  scope: HouseholdScope,
  start: string,
  end: string,
  categoryId: string | undefined,
) {
  const isExpense = sql`${transactions.kind} = 'expense'`;
  // Postgres returns bigint sums as strings; they stay far below 2^53 (see MAX_AMOUNT_MINOR).
  const total = (value: ReturnType<typeof sql>, filter: ReturnType<typeof sql>) =>
    sql<string>`coalesce(sum(${value}) filter (where ${filter}), 0)`;
  return db
    .select({
      date: transactions.occurredOn,
      expenses: total(sql`${transactions.amount}`, isExpense),
      income: total(sql`${transactions.amount}`, sql`not ${isExpense}`),
      yourExpenses: total(yourPart, isExpense),
      yourIncome: total(yourPart, sql`not ${isExpense}`),
      count: sql<string>`count(*)`,
    })
    .from(transactions)
    .leftJoin(transactionSplits, ownSplit(scope.userId))
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        visibleTo(scope.userId),
        gte(transactions.occurredOn, start),
        lt(transactions.occurredOn, end),
        categoryId ? eq(transactions.categoryId, categoryId) : undefined,
      ),
    )
    .groupBy(transactions.occurredOn);
}

type RecurringEvent = Extract<CalendarEvent, { type: 'recurringPaid' | 'recurringExpected' }>;

/**
 * The month's payments (and, for income series, receipts) of the viewer's tracked series:
 * the ones found among their transactions, and the ones still expected. Expected dates start at the series' next due
 * date and follow its rhythm; a series whose payment is overdue past its grace window
 * (cancelled?) expects nothing, and neither does a month too far ahead.
 */
async function recurringEvents(
  scope: HouseholdScope,
  month: string,
  start: string,
  end: string,
  today: string,
): Promise<RecurringEvent[]> {
  const tracked = await seriesWithPayments(db, scope, today);
  const inMonth = tracked.flatMap(({ series, payments }) =>
    payments
      .filter((payment) => payment.occurredOn >= start && payment.occurredOn < end)
      .map((payment) => ({ series, payment })),
  );
  const shares = await sharesOf(
    db,
    scope.userId,
    inMonth.flatMap(({ payment }) => (payment.visibility === 'shared' ? payment.id : [])),
  );

  const events: RecurringEvent[] = inMonth.map(({ series, payment }) => ({
    type: 'recurringPaid',
    date: payment.occurredOn,
    seriesId: series.id,
    name: series.name,
    scope: series.scope,
    kind: series.kind,
    categoryId: series.categoryId,
    amount: payment.amount,
    transactionId: payment.id,
    yourAmount: payment.visibility === 'shared' ? (shares.get(payment.id) ?? 0) : payment.amount,
  }));

  if (month < today.slice(0, 7) || month > lastCalendarMonth(today.slice(0, 7))) return events;
  for (const { series } of tracked) {
    const { anchorOn, cadence } = series;
    const next = nextDueOn(series, series.lastPaidOn, today);
    if (seriesTiming(next, cadence, today).timing === 'lapsed') continue;
    const first = nearestOccurrenceIndex(anchorOn, cadence, next);
    for (let index = first; ; index += 1) {
      const date = occurrence(anchorOn, cadence, index);
      if (date >= end) break;
      if (date < start) continue;
      events.push({
        type: 'recurringExpected',
        date,
        seriesId: series.id,
        name: series.name,
        scope: series.scope,
        kind: series.kind,
        categoryId: series.categoryId,
        amount: series.latestAmount,
        amountVaries: series.amountVaries,
        // A private series is all the viewer's; a shared one goes by the latest split.
        yourAmount: series.scope === 'private' ? series.latestAmount : series.share,
      });
    }
  }
  return events;
}

const EVENT_ORDER: Record<CalendarEvent['type'], number> = {
  recurringPaid: 0,
  recurringExpected: 1,
  settlement: 2,
};

/**
 * One month for the calendar page, as the viewer sees it: totals per day, the payments of
 * their tracked recurring series (found and still expected) and the household's
 * settlements. Other people's private transactions and series never count. With a
 * category, only what is filed under it (an id from elsewhere simply matches nothing).
 */
export async function getCalendar(
  scope: HouseholdScope,
  { month, categoryId }: CalendarQuery,
  { today = budapestToday() }: Options = {},
): Promise<Calendar> {
  const { household } = await requireMembership(db, scope);
  const [start, end] = monthRange(month);

  const [totals, recurring, settled] = await Promise.all([
    dayTotals(scope, start, end, categoryId),
    recurringEvents(scope, month, start, end, today),
    // Settlements have no category: a category's calendar has none.
    categoryId ? [] : settlementsBetween(db, scope.householdId, start, end),
  ]);

  const byDate = new Map(totals.map((row) => [row.date, row]));
  const days: CalendarDay[] = daysOfMonth(month).map((date) => {
    const row = byDate.get(date);
    return {
      date,
      expenses: Number(row?.expenses ?? 0),
      income: Number(row?.income ?? 0),
      yourExpenses: Number(row?.yourExpenses ?? 0),
      yourIncome: Number(row?.yourIncome ?? 0),
      count: Number(row?.count ?? 0),
    };
  });

  const events: CalendarEvent[] = [
    ...recurring.filter((event) => !categoryId || event.categoryId === categoryId),
    ...settled.map((settlement): CalendarEvent => ({
      type: 'settlement',
      date: settlement.settledOn,
      settlementId: settlement.id,
      from: settlement.from,
      to: settlement.to,
      amount: settlement.amount,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      EVENT_ORDER[a.type] - EVENT_ORDER[b.type] ||
      b.amount - a.amount,
  );

  return { month, today, currency: household.baseCurrency, days, events };
}
