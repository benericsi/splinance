import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns';
import { householdMembers } from './household-members';

/**
 * Single-use invite links. Only the SHA-256 hash of the token is stored.
 * Both people involved are referenced through composite foreign keys to
 * household_members: the creator and the accepter must be members of this very
 * household (which also guarantees the household exists).
 */
export const householdInvites = pgTable(
  'household_invites',
  {
    id: id(),
    householdId: uuid().notNull(),
    tokenHash: text().notNull().unique('household_invites_token_hash_unique'),
    createdBy: uuid().notNull(),
    expiresAt: timestamptz().notNull(),
    acceptedBy: uuid(),
    acceptedAt: timestamptz(),
    revokedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'household_invites_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'household_invites_accepted_by_member_fk',
      columns: [t.householdId, t.acceptedBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    index('household_invites_household_id_idx').on(t.householdId),
    check(
      'household_invites_accepted_consistent',
      sql`(${t.acceptedBy} is null) = (${t.acceptedAt} is null)`,
    ),
  ],
);

export type HouseholdInviteRow = typeof householdInvites.$inferSelect;
