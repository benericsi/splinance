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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { householdMembers } from './household-members';
import { importBatches } from './import-batches';
import { savingsGoals } from './savings-goals';

/**
 * Money a member put into a goal (positive) or took out of it (negative). Not a
 * transaction: it never counts as spending and creates no debt between members. Never
 * edited: a wrong one is soft deleted (`deleted_at`) and recorded again. An entry made from
 * a bank row (a transfer to or from a savings pocket) points back to its import, so undoing
 * the import removes it, and carries the row's fingerprint, so the row is not imported twice.
 */
export const savingsEntries = pgTable(
  'savings_entries',
  {
    id: id(),
    householdId: uuid().notNull(),
    goalId: uuid().notNull(),
    userId: uuid().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    entryOn: date({ mode: 'string' }).notNull(),
    note: text(),
    importBatchId: uuid(),
    /** The bank row it came from, per person, like a transaction's (see the unique index). */
    importFingerprint: text(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'savings_entries_goal_fk',
      columns: [t.householdId, t.goalId],
      foreignColumns: [savingsGoals.householdId, savingsGoals.id],
    }),
    foreignKey({
      name: 'savings_entries_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'savings_entries_import_batch_fk',
      columns: [t.householdId, t.importBatchId],
      foreignColumns: [importBatches.householdId, importBatches.id],
    }),
    // A bank row is imported once per person; deleted ones may come back (undo, re-import).
    uniqueIndex('savings_entries_import_fingerprint_unique')
      .on(t.householdId, t.userId, t.importFingerprint)
      .where(sql`${t.importFingerprint} is not null and ${t.deletedAt} is null`),
    // A goal's live entries, newest first: its history and its balance.
    index('savings_entries_goal_entry_idx')
      .on(t.goalId, t.entryOn.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    // What one person set aside in a month.
    index('savings_entries_user_entry_idx')
      .on(t.householdId, t.userId, t.entryOn)
      .where(sql`${t.deletedAt} is null`),
    check(
      'savings_entries_amount_range',
      sql`${t.amount} <> 0 and ${t.amount} between ${sql.raw(String(-MAX_AMOUNT_MINOR))} and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
    check('savings_entries_note_length', sql`char_length(${t.note}) <= 200`),
    check(
      'savings_entries_import_consistent',
      sql`(${t.importBatchId} is null) = (${t.importFingerprint} is null)`,
    ),
  ],
);

export type SavingsEntryRow = typeof savingsEntries.$inferSelect;
