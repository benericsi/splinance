import { monthsBetween, type Report, type ReportQuery } from '@splinance/shared';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { transactions, transactionSplits } from '../../db/schema';
import { monthRange } from '../../lib/months';
import { requireMembership } from '../households/households.service';
import { type HouseholdScope, visibleTo } from '../transactions/transactions.service';

/**
 * Month totals and spending per category over a range of months, as the viewer sees them:
 * shared transactions and their own private ones (like the month summary), plus their own
 * part of each (the whole of a private one, their share of a shared one). Months without
 * transactions come back as zeros, so charts need no gap handling.
 */
export async function getReport(scope: HouseholdScope, query: ReportQuery): Promise<Report> {
  const { household } = await requireMembership(db, scope);
  const [start] = monthRange(query.from);
  const [, end] = monthRange(query.to);

  const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const isExpense = sql`${transactions.kind} = 'expense'`;
  const yourPart = sql`case when ${transactions.visibility} = 'private' then ${transactions.amount} else coalesce(${transactionSplits.amount}, 0) end`;
  // Postgres returns bigint sums as strings; they stay far below 2^53 (see MAX_AMOUNT_MINOR).
  const total = (value: ReturnType<typeof sql>, filter: ReturnType<typeof sql>) =>
    sql<string>`coalesce(sum(${value}) filter (where ${filter}), 0)`;

  // One pass grouped by month and category; month totals are the sums of its rows.
  const rows = await db
    .select({
      month,
      categoryId: transactions.categoryId,
      expenses: total(sql`${transactions.amount}`, isExpense),
      income: total(sql`${transactions.amount}`, sql`not ${isExpense}`),
      yourExpenses: total(yourPart, isExpense),
      yourIncome: total(yourPart, sql`not ${isExpense}`),
    })
    .from(transactions)
    .leftJoin(
      transactionSplits,
      and(
        eq(transactionSplits.transactionId, transactions.id),
        eq(transactionSplits.userId, scope.userId),
      ),
    )
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        visibleTo(scope.userId),
        gte(transactions.occurredOn, start),
        lt(transactions.occurredOn, end),
      ),
    )
    .groupBy(month, transactions.categoryId)
    .orderBy(month, transactions.categoryId);

  const byMonth = new Map(
    monthsBetween(query.from, query.to).map((m) => [
      m,
      { month: m, expenses: 0, income: 0, yourExpenses: 0, yourIncome: 0 },
    ]),
  );
  for (const row of rows) {
    const totals = byMonth.get(row.month);
    if (!totals) continue;
    totals.expenses += Number(row.expenses);
    totals.income += Number(row.income);
    totals.yourExpenses += Number(row.yourExpenses);
    totals.yourIncome += Number(row.yourIncome);
  }

  return {
    from: query.from,
    to: query.to,
    currency: household.baseCurrency,
    months: [...byMonth.values()],
    categories: rows
      .filter((row) => Number(row.expenses) > 0 || Number(row.yourExpenses) > 0)
      .map((row) => ({
        month: row.month,
        categoryId: row.categoryId,
        expenses: Number(row.expenses),
        yourExpenses: Number(row.yourExpenses),
      })),
  };
}
