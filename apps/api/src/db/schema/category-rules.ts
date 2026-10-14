import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { createdAt, id, updatedAt } from './columns';
import { categoryKind } from './enums';
import { householdMembers } from './household-members';

/**
 * "When the merchant or description contains `pattern`, use `category_id`", per household.
 * Rules are settings, not money records: deleting one removes the row (nothing refers to
 * it, and transactions it categorized keep their category).
 */
export const categoryRules = pgTable(
  'category_rules',
  {
    id: id(),
    householdId: uuid().notNull(),
    pattern: text().notNull(),
    /** `matchKey(pattern)`: what uniqueness and matching compare. */
    patternKey: text().notNull(),
    categoryId: uuid().notNull(),
    /** The category's kind, so the foreign key can check it (like transactions). */
    kind: categoryKind().notNull(),
    markShared: boolean().notNull().default(false),
    /** First match wins, lowest first. */
    position: integer().notNull(),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'category_rules_category_fk',
      columns: [t.householdId, t.categoryId, t.kind],
      foreignColumns: [categories.householdId, categories.id, categories.kind],
    }),
    foreignKey({
      name: 'category_rules_created_by_member_fk',
      columns: [t.householdId, t.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // One rule per text and kind: two rules with the same text could only contradict.
    unique('category_rules_household_kind_pattern_unique').on(t.householdId, t.kind, t.patternKey),
    check('category_rules_pattern_length', sql`char_length(${t.pattern}) between 2 and 60`),
    check('category_rules_position_non_negative', sql`${t.position} >= 0`),
  ],
);

export type CategoryRuleRow = typeof categoryRules.$inferSelect;
