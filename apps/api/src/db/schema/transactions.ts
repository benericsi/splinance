import { MAX_AMOUNT_MINOR } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { categoryKind, currency, splitMethod, transactionVisibility } from './enums';
import { householdMembers } from './household-members';

/**
 * Money movements of a household. Amounts are positive minor units; `kind` says the
 * direction. For income, `paid_by` is the person who received it. Never hard-deleted:
 * `deleted_at` hides a row, `version` guards concurrent edits (optimistic locking).
 * A deferred constraint trigger (migration 0006) checks that the splits sum to the amount.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    householdId: uuid().notNull(),
    createdBy: uuid().notNull(),
    paidBy: uuid().notNull(),
    kind: categoryKind().notNull(),
    visibility: transactionVisibility().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    currency: currency().notNull(),
    occurredOn: date({ mode: 'string' }).notNull(),
    description: text().notNull(),
    categoryId: uuid(),
    splitMethod: splitMethod(),
    version: integer().notNull().default(1),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'transactions_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'transactions_paid_by_member_fk',
      columns: [t.householdId, t.paidBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // A null category_id skips the check (MATCH SIMPLE); otherwise same household, same kind.
    foreignKey({
      name: 'transactions_category_fk',
      columns: [t.householdId, t.categoryId, t.kind],
      foreignColumns: [categories.householdId, categories.id, categories.kind],
    }),
    // Target of the composite foreign key from transaction_splits.
    unique('transactions_household_id_id_unique').on(t.householdId, t.id),
    // The list query: a household's live transactions, newest first.
    index('transactions_household_occurred_idx')
      .on(t.householdId, t.occurredOn.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    check(
      'transactions_amount_range',
      sql`${t.amount} between 1 and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
    check('transactions_description_length', sql`char_length(${t.description}) between 1 and 120`),
    // Private: the author paid. Shared: there is a split method (and splits, see the trigger).
    check(
      'transactions_private_paid_by_author',
      sql`${t.visibility} = 'shared' or ${t.paidBy} = ${t.createdBy}`,
    ),
    check(
      'transactions_split_method_iff_shared',
      sql`(${t.visibility} = 'shared') = (${t.splitMethod} is not null)`,
    ),
    check('transactions_version_positive', sql`${t.version} >= 1`),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
