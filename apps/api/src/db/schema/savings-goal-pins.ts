import { foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns';
import { householdMembers } from './household-members';
import { savingsGoals } from './savings-goals';

/**
 * The goals a person keeps on top of their savings page. Per person, not per goal: one
 * member pinning a shared goal changes nothing for the others. A row exists while the goal
 * is pinned; closing a goal removes its pins.
 */
export const savingsGoalPins = pgTable(
  'savings_goal_pins',
  {
    householdId: uuid().notNull(),
    goalId: uuid().notNull(),
    userId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'savings_goal_pins_pk', columns: [t.goalId, t.userId] }),
    foreignKey({
      name: 'savings_goal_pins_goal_fk',
      columns: [t.householdId, t.goalId],
      foreignColumns: [savingsGoals.householdId, savingsGoals.id],
    }),
    foreignKey({
      name: 'savings_goal_pins_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // A person's pins in a household: the list's `pinned` flags and the limit.
    index('savings_goal_pins_user_idx').on(t.householdId, t.userId),
  ],
);
