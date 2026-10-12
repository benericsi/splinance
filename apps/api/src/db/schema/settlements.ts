import { MAX_AMOUNT_MINOR } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { currency } from './enums';
import { householdMembers } from './household-members';

/**
 * Payments between two members made outside the app ("mark as paid"). They reduce the debt
 * between `from_user_id` (who paid) and `to_user_id` (who received). Never edited: a wrong
 * one is soft deleted (`deleted_at`) and recorded again.
 */
export const settlements = pgTable(
  'settlements',
  {
    id: id(),
    householdId: uuid().notNull(),
    fromUserId: uuid().notNull(),
    toUserId: uuid().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    currency: currency().notNull(),
    settledOn: date({ mode: 'string' }).notNull(),
    note: text(),
    createdBy: uuid().notNull(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'settlements_from_member_fk',
      columns: [t.householdId, t.fromUserId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'settlements_to_member_fk',
      columns: [t.householdId, t.toUserId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'settlements_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // The list query: a household's live settlements, newest first.
    index('settlements_household_settled_idx')
      .on(t.householdId, t.settledOn.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    check('settlements_different_people', sql`${t.fromUserId} <> ${t.toUserId}`),
    check(
      'settlements_amount_range',
      sql`${t.amount} between 1 and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
    check('settlements_note_length', sql`char_length(${t.note}) <= 200`),
  ],
);

export type SettlementRow = typeof settlements.$inferSelect;
