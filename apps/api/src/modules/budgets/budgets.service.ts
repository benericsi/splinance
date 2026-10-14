import type { Budget, BudgetInput, BudgetList } from '@splinance/shared';
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { budgets, categories, transactions } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { monthRange } from '../../lib/months';
import { requireMembership } from '../households/households.service';
import type { HouseholdScope } from '../transactions/transactions.service';

const invalidCategory = () =>
  new HttpError(400, 'Choose an active expense category', 'INVALID_CATEGORY');

/**
 * The household budgets in force in `month`, each with the shared spending against it.
 * A category's amount is its latest row starting on or before the month; a null amount
 * there means it has none. Archived categories drop out. Every member sees the same: only
 * shared expenses count, which everyone can see anyway.
 */
export async function listBudgets(scope: HouseholdScope, month: string): Promise<BudgetList> {
  const { household } = await requireMembership(db, scope);
  const [from, to] = monthRange(month);

  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      startsOn: budgets.startsOn,
    })
    .from(budgets)
    .innerJoin(
      categories,
      and(eq(categories.id, budgets.categoryId), isNull(categories.archivedAt)),
    )
    .where(
      and(
        eq(budgets.householdId, scope.householdId),
        isNull(budgets.userId),
        lte(budgets.startsOn, from),
      ),
    )
    .orderBy(budgets.categoryId, desc(budgets.startsOn));

  // Rows come newest first per category: the first one seen is in force.
  const inForce = new Map<string, { amount: number | null; since: string }>();
  for (const row of rows) {
    if (!inForce.has(row.categoryId)) {
      inForce.set(row.categoryId, { amount: row.amount, since: row.startsOn.slice(0, 7) });
    }
  }
  const active = [...inForce].filter(
    (entry): entry is [string, { amount: number; since: string }] => entry[1].amount !== null,
  );
  if (active.length === 0) return { month, currency: household.baseCurrency, budgets: [] };

  const spending = await db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.kind, 'expense'),
        eq(transactions.visibility, 'shared'),
        isNull(transactions.deletedAt),
        inArray(
          transactions.categoryId,
          active.map(([categoryId]) => categoryId),
        ),
        gte(transactions.occurredOn, from),
        lt(transactions.occurredOn, to),
      ),
    )
    .groupBy(transactions.categoryId);
  const spentBy = new Map(spending.map((row) => [row.categoryId, Number(row.spent)]));

  const list: Budget[] = active.map(([categoryId, { amount, since }]) => ({
    categoryId,
    amount,
    since,
    spent: spentBy.get(categoryId) ?? 0,
  }));
  return { month, currency: household.baseCurrency, budgets: list };
}

/**
 * Sets a category's household budget from `input.from` on (until a later change). Setting
 * the same month twice replaces that month's amount. Any member may do it.
 */
export async function setBudget(
  scope: HouseholdScope & { categoryId: string },
  input: BudgetInput,
): Promise<void> {
  await requireMembership(db, scope);
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, scope.categoryId),
        eq(categories.householdId, scope.householdId),
        eq(categories.kind, 'expense'),
        isNull(categories.archivedAt),
      ),
    );
  if (!category) throw invalidCategory();

  const startsOn = `${input.from}-01`;
  await db
    .insert(budgets)
    .values({
      householdId: scope.householdId,
      categoryId: category.id,
      startsOn,
      amount: input.amount,
      createdBy: scope.userId,
    })
    .onConflictDoUpdate({
      target: [budgets.householdId, budgets.categoryId, budgets.userId, budgets.startsOn],
      set: { amount: input.amount, updatedAt: new Date() },
    });
}
