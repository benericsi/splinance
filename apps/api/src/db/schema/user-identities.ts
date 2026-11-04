import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns';
import { users } from './users';

/**
 * A sign-in provider's account linked to a user ("Continue with Google"). Matched by the
 * provider's stable `sub` claim, never by email: emails change and get reused. Provider ids
 * come from the code registry (text, not an enum), so a new provider needs no migration.
 * Like sessions, rows go with their user (cascade). No provider tokens are stored.
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: id(),
    userId: uuid().notNull(),
    provider: text().notNull(),
    subject: text().notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'user_identities_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    // One Splinance user per provider account.
    unique('user_identities_provider_subject_unique').on(t.provider, t.subject),
    // One account per provider and user; its leading column also serves "identities of a user".
    unique('user_identities_user_provider_unique').on(t.userId, t.provider),
    check('user_identities_provider_format', sql`${t.provider} ~ '^[a-z][a-z0-9-]{1,31}$'`),
    check('user_identities_subject_length', sql`char_length(${t.subject}) between 1 and 255`),
  ],
);

export type UserIdentityRow = typeof userIdentities.$inferSelect;
