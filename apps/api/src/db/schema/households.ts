import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { currency } from './enums';
import { users } from './users';

export const households = pgTable(
  'households',
  {
    id: id(),
    name: text().notNull(),
    baseCurrency: currency().notNull().default('HUF'),
    createdBy: uuid().notNull(),
    // Soft delete: an archived household is invisible to everyone (404), its history is kept.
    archivedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'households_created_by_fk',
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }),
    check('households_name_length', sql`char_length(${t.name}) between 1 and 60`),
  ],
);

export type HouseholdRow = typeof households.$inferSelect;
