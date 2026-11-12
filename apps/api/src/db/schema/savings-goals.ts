import { MAX_AMOUNT_MINOR } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { currency, transactionVisibility } from './enums';
import { householdMembers } from './household-members';

/**
 * Something a household or one person saves for. The app moves no money: a goal is a
 * ledger of what was put aside elsewhere (`savings_entries`), and its balance is their sum,
 * never stored. `visibility` is set once: a private goal is readable only by `created_by`,
 * and making it shared later would publish its history.
 */
export const savingsGoals = pgTable(
  'savings_goals',
  {
    id: id(),
    householdId: uuid().notNull(),
    name: text().notNull(),
    /** Null for an open-ended pot. */
    targetAmount: bigint({ mode: 'number' }),
    targetDate: date({ mode: 'string' }),
    currency: currency().notNull(),
    visibility: transactionVisibility().notNull(),
    createdBy: uuid().notNull(),
    /** Closed: kept with its history, no new entries. */
    archivedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'savings_goals_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // Target of the entries' composite foreign key: an entry's goal is in its household.
    unique('savings_goals_household_id_id_unique').on(t.householdId, t.id),
    index('savings_goals_household_idx').on(t.householdId, t.id),
    check('savings_goals_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check(
      'savings_goals_target_range',
      sql`${t.targetAmount} is null or ${t.targetAmount} between 1 and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
  ],
);

export type SavingsGoalRow = typeof savingsGoals.$inferSelect;
