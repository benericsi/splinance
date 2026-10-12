import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns';
import { importSource } from './enums';
import { householdMembers } from './household-members';

/**
 * One bank export imported by one person. The transactions it created point back here, so
 * the whole import can be undone. The file itself is never uploaded: the browser parses it
 * and sends normalized rows.
 */
export const importBatches = pgTable(
  'import_batches',
  {
    id: id(),
    householdId: uuid().notNull(),
    createdBy: uuid().notNull(),
    source: importSource().notNull(),
    fileName: text(),
    /** Transactions created (rows already imported are skipped, not counted). */
    rowCount: integer().notNull(),
    /** Set when undone: its transactions were soft deleted. */
    undoneAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'import_batches_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // Target of the composite foreign key from transactions.
    unique('import_batches_household_id_id_unique').on(t.householdId, t.id),
    // "My imports", newest first.
    index('import_batches_household_creator_idx').on(t.householdId, t.createdBy, t.createdAt),
    check('import_batches_row_count_non_negative', sql`${t.rowCount} >= 0`),
    check('import_batches_file_name_length', sql`char_length(${t.fileName}) <= 200`),
  ],
);

export type ImportBatchRow = typeof importBatches.$inferSelect;
