import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz } from './columns';
import { users } from './users';

/**
 * One row per login (device). The refresh token rotates in place:
 * the current token's hash moves to previousTokenHash on every refresh,
 * which allows a short multi-tab grace window and reuse detection.
 * Only SHA-256 hashes are stored, never raw tokens.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique('sessions_token_hash_unique'),
    previousTokenHash: text(),
    rotatedAt: timestamptz().notNull().defaultNow(),
    expiresAt: timestamptz().notNull(),
    revokedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_previous_token_hash_idx').on(t.previousTokenHash),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
