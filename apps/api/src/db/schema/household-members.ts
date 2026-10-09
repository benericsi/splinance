import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './columns';
import { householdRole } from './enums';
import { households } from './households';
import { users } from './users';

/**
 * Membership is never deleted: leaving or being removed sets left_at, so history
 * (and later the balances) can still point at the member. Rejoining reuses the row.
 * The (household_id, user_id) key is the target of composite foreign keys from
 * household-scoped tables, so the database rejects references across households.
 */
export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid().notNull(),
    userId: uuid().notNull(),
    role: householdRole().notNull(),
    joinedAt: timestamptz().notNull().defaultNow(),
    leftAt: timestamptz(),
  },
  (t) => [
    primaryKey({ name: 'household_members_pk', columns: [t.householdId, t.userId] }),
    foreignKey({
      name: 'household_members_household_id_fk',
      columns: [t.householdId],
      foreignColumns: [households.id],
    }),
    foreignKey({
      name: 'household_members_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }),
    index('household_members_user_id_idx').on(t.userId),
    check(
      'household_members_left_after_joined',
      sql`${t.leftAt} is null or ${t.leftAt} >= ${t.joinedAt}`,
    ),
  ],
);

export type HouseholdMemberRow = typeof householdMembers.$inferSelect;
