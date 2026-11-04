import { MAX_AMOUNT_MINOR } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import {
  categoryKind,
  currency,
  recurringCadence,
  recurringSource,
  recurringStatus,
} from './enums';
import { householdMembers } from './household-members';

/**
 * Recurring payments people track: added by hand or confirmed from a suggestion (`active`),
 * and suggestions they turned down (`dismissed`, only the pattern matters). Which
 * transactions are a series' payments is never stored: it follows from the pattern on every
 * read, like balances follow from transactions. Settings, not money records: no audit log;
 * "Show again" deletes a dismissal, "Stop tracking" archives a series.
 */
export const recurringSeries = pgTable(
  'recurring_series',
  {
    id: id(),
    householdId: uuid().notNull(),
    /** Null: a shared series (the household's). Set: private to that member. */
    userId: uuid(),
    /** Always 'expense' for now (CHECK); kept for income series and the category FK. */
    kind: categoryKind().notNull().default('expense'),
    status: recurringStatus().notNull(),
    source: recurringSource().notNull(),
    name: text(),
    /** As typed (or the detected key). */
    pattern: text().notNull(),
    /** `matchKey(pattern)`: what uniqueness compares. */
    patternKey: text().notNull(),
    cadence: recurringCadence(),
    /** The expected amount when the series was set up, in minor units. */
    amount: bigint({ mode: 'number' }),
    amountVaries: boolean().notNull().default(false),
    currency: currency().notNull(),
    /** A payment date that sets the rhythm (the next or the last one). */
    anchorOn: date({ mode: 'string' }),
    /** The earliest payment the series may claim. */
    startsOn: date({ mode: 'string' }),
    categoryId: uuid(),
    remind: boolean().notNull().default(true),
    archivedAt: timestamptz(),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('recurring_series_household_id_id_unique').on(t.householdId, t.id),
    // A null category skips the check (MATCH SIMPLE).
    foreignKey({
      name: 'recurring_series_category_fk',
      columns: [t.householdId, t.categoryId, t.kind],
      foreignColumns: [categories.householdId, categories.id, categories.kind],
    }),
    foreignKey({
      name: 'recurring_series_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'recurring_series_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // One live series or dismissal per text and owner. The coalesce makes two shared rows
    // (user_id null) collide too, like NULLS NOT DISTINCT.
    uniqueIndex('recurring_series_pattern_unique')
      .on(
        t.householdId,
        sql`coalesce(${t.userId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.kind,
        t.patternKey,
      )
      .where(sql`${t.archivedAt} is null`),
    check('recurring_series_expense_only', sql`${t.kind} = 'expense'`),
    check('recurring_series_pattern_length', sql`char_length(${t.pattern}) between 2 and 60`),
    check('recurring_series_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check(
      'recurring_series_amount_range',
      sql`${t.amount} between 1 and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
    // An active series has everything a payment rhythm needs; a dismissal only its pattern.
    check(
      'recurring_series_active_complete',
      sql`${t.status} <> 'active' or (${t.name} is not null and ${t.cadence} is not null and ${t.amount} is not null and ${t.anchorOn} is not null)`,
    ),
    check('recurring_series_starts_before_anchor', sql`${t.startsOn} <= ${t.anchorOn}`),
  ],
);

export type RecurringSeriesRow = typeof recurringSeries.$inferSelect;
