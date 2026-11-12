import { sql } from 'drizzle-orm';
import { check, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { locale, overviewView, spendingView, transactionVisibility } from './enums';

export const users = pgTable(
  'users',
  {
    id: id(),
    // Normalized to lowercase by the shared emailSchema; the check guards other write paths.
    email: text().notNull().unique('users_email_unique'),
    // Null for accounts that only sign in with a provider (user_identities).
    passwordHash: text(),
    displayName: text().notNull(),
    // The chosen UI language; null follows the device. Only the web uses it (the API speaks
    // English and in error codes).
    locale: locale(),
    // Preferences (shared `preferencesSchema`): defaults that fill in what a URL leaves open.
    // How the overview opens on a wide screen.
    overviewView: overviewView().notNull().default('cards'),
    // What a new transaction starts as (editing one keeps its own visibility).
    transactionVisibility: transactionVisibility().notNull().default('shared'),
    // Whose spending Reports and the Calendar show.
    spendingView: spendingView().notNull().default('household'),
    // Set when the person deleted their account: the row stays (history references it) but
    // holds nothing personal any more (see account deletion in docs/data-model.md).
    deletedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_display_name_length', sql`char_length(${t.displayName}) between 1 and 50`),
  ],
);

export type UserRow = typeof users.$inferSelect;
