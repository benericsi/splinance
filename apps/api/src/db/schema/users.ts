import { sql } from 'drizzle-orm';
import { check, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './columns';

export const users = pgTable(
  'users',
  {
    id: id(),
    // Normalized to lowercase by the shared emailSchema; the check guards other write paths.
    email: text().notNull().unique('users_email_unique'),
    passwordHash: text().notNull(),
    displayName: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_display_name_length', sql`char_length(${t.displayName}) between 1 and 50`),
  ],
);

export type UserRow = typeof users.$inferSelect;
