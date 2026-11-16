import { MAX_AMOUNT_MINOR } from '@splinance/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';
import { householdMembers } from './household-members';
import { savingsGoals } from './savings-goals';

/**
 * What a person plans to put into a goal each month. Per person, not per goal: on a shared
 * goal each member plans their own part, and the goal is on track when the parts add up.
 * A row exists while the plan does; closing a goal removes its plans.
 */
export const savingsGoalPlans = pgTable(
  'savings_goal_plans',
  {
    householdId: uuid().notNull(),
    goalId: uuid().notNull(),
    userId: uuid().notNull(),
    monthlyAmount: bigint({ mode: 'number' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'savings_goal_plans_pk', columns: [t.goalId, t.userId] }),
    foreignKey({
      name: 'savings_goal_plans_goal_fk',
      columns: [t.householdId, t.goalId],
      foreignColumns: [savingsGoals.householdId, savingsGoals.id],
    }),
    foreignKey({
      name: 'savings_goal_plans_user_member_fk',
      columns: [t.householdId, t.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
    }),
    // A person's plans in a household: what they still mean to set aside this month.
    index('savings_goal_plans_user_idx').on(t.householdId, t.userId),
    check(
      'savings_goal_plans_amount_range',
      sql`${t.monthlyAmount} between 1 and ${sql.raw(String(MAX_AMOUNT_MINOR))}`,
    ),
  ],
);

export type SavingsGoalPlanRow = typeof savingsGoalPlans.$inferSelect;
