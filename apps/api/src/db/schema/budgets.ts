import { MAX_AMOUNT_MINOR } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { createdAt, id, updatedAt } from './columns';
import { categoryKind } from './enums';
import { householdMembers } from './household-members';

/**
 * Monthly budgets per category, effective-dated: a row sets the amount from `starts_on` (the
 * first of a month) until a later row for the same category. A null amount ends the budget
 * from that month on. `user_id` is null for household budgets (over shared spending); a
 * person's own budgets can use it later.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: id(),
    householdId: uuid().notNull(),
    categoryId: uuid().notNull(),
    /** Always 'expense': only expense categories get budgets (CHECK), kept for the FK. */
    kind: categoryKind().notNull().default('expense'),
    userId: uuid(),
    startsOn: date({ mode: 'string' }).notNull(),
    amount: bigint({ mode: 'number' }),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'budgets_category_fk',
      columns: [t.householdId, t.categoryId, t.kind],
      foreignColumns: [categories.householdId, categories.id, categories.kind],
    }),
    // A null user_id skips the check (MATCH SIMPLE): household budgets.
    foreignKey({
      name: 'budgets_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'budgets_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // One amount per category, owner and month; NULLS NOT DISTINCT so household rows
    // (user_id null) collide too.
    unique('budgets_category_owner_month_unique')
      .on(t.householdId, t.categoryId, t.userId, t.startsOn)
      .nullsNotDistinct(),
    index('budgets_household_starts_idx').on(t.householdId, t.startsOn),
    check('budgets_expense_only', sql`${t.kind} = 'expense'`),
    check('budgets_month_start', sql`extract(day from ${t.startsOn}) = 1`),
    check(
      'budgets_amount_range',
      sql`${t.amount} is null or ${t.amount} between 1 and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
  ],
);

export type BudgetRow = typeof budgets.$inferSelect;
