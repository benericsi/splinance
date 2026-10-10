import type { BrandColor, CategoryIcon } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, timestamptz, updatedAt } from './columns';
import { categoryKind } from './enums';
import { households } from './households';

/**
 * Household-scoped categories. Icon and color are validated by the shared Zod schemas (closed
 * lists that may grow), not by the database. Archiving hides a category from pickers but keeps
 * it readable for the transactions filed under it.
 */
export const categories = pgTable(
  'categories',
  {
    id: id(),
    householdId: uuid().notNull(),
    name: text().notNull(),
    kind: categoryKind().notNull(),
    icon: text().$type<CategoryIcon>().notNull(),
    color: text().$type<BrandColor>().notNull(),
    archivedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'categories_household_id_fk',
      columns: [t.householdId],
      foreignColumns: [households.id],
    }),
    // Target of composite foreign keys: a transaction can only use its own household's categories.
    unique('categories_household_id_id_unique').on(t.householdId, t.id),
    // Same, including the kind: an expense can only be filed under an expense category.
    unique('categories_household_id_id_kind_unique').on(t.householdId, t.id, t.kind),
    // Names are unique per household and kind, ignoring case, among active categories only, so
    // an archived name can be reused.
    uniqueIndex('categories_household_kind_name_unique')
      .on(t.householdId, t.kind, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('categories_name_length', sql`char_length(${t.name}) between 1 and 40`),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
