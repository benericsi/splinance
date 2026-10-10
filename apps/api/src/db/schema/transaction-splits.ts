import { PERCENT_SCALE } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  uuid,
} from 'drizzle-orm/pg-core';
import { householdMembers } from './household-members';
import { transactions } from './transactions';

/**
 * Each person's share of a shared transaction, in minor units. Rows are replaced on every
 * edit. Composite foreign keys keep the transaction and the person in the same household.
 */
export const transactionSplits = pgTable(
  'transaction_splits',
  {
    transactionId: uuid().notNull(),
    householdId: uuid().notNull(),
    userId: uuid().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    /** What was entered for percentage splits (100% = 10 000); null otherwise. */
    basisPoints: integer(),
  },
  (t) => [
    primaryKey({ name: 'transaction_splits_pk', columns: [t.transactionId, t.userId] }),
    foreignKey({
      name: 'transaction_splits_transaction_fk',
      columns: [t.householdId, t.transactionId],
      foreignColumns: [transactions.householdId, transactions.id],
    }),
    foreignKey({
      name: 'transaction_splits_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // Balances (Phase 3) sum a member's shares per household.
    index('transaction_splits_household_user_idx').on(t.householdId, t.userId),
    // A share can be 0 when the total has fewer units than people (2 forints among 3).
    check('transaction_splits_amount_non_negative', sql`${t.amount} >= 0`),
    check(
      'transaction_splits_basis_points_range',
      sql`${t.basisPoints} is null or ${t.basisPoints} between 1 and ${sql.raw(String(PERCENT_SCALE))}`,
    ),
  ],
);

export type TransactionSplitRow = typeof transactionSplits.$inferSelect;
