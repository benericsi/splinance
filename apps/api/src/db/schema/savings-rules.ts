import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './columns';
import { householdMembers } from './household-members';
import { savingsGoals } from './savings-goals';

/**
 * "A bank row whose merchant or description contains `pattern` is money moved to or from
 * this goal", for one person: the import review pre-fills the goal from it. Per person, not
 * per household (unlike category rules), since a pocket is one person's account and a rule
 * may point at their private goal. Settings, not money records: deleting one removes the row.
 */
export const savingsRules = pgTable(
  'savings_rules',
  {
    id: id(),
    householdId: uuid().notNull(),
    userId: uuid().notNull(),
    goalId: uuid().notNull(),
    pattern: text().notNull(),
    /** `matchKey(pattern)`: what uniqueness and matching compare. */
    patternKey: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'savings_rules_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    foreignKey({
      name: 'savings_rules_goal_fk',
      columns: [t.householdId, t.goalId],
      foreignColumns: [savingsGoals.householdId, savingsGoals.id],
    }),
    // One rule per text and person: two rules with the same text could only contradict.
    unique('savings_rules_user_pattern_unique').on(t.householdId, t.userId, t.patternKey),
    check('savings_rules_pattern_length', sql`char_length(${t.pattern}) between 2 and 60`),
  ],
);

export type SavingsRuleRow = typeof savingsRules.$inferSelect;
