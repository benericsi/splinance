import { z } from 'zod';
import { currencySchema } from './households';
import { amountMinorSchema } from './money';
import { monthSchema } from './transactions';

/**
 * Sets a category's monthly budget from a month on, until changed again. `amount: null`
 * removes it from that month on (earlier months keep theirs).
 */
export const budgetInputSchema = z.object({
  amount: amountMinorSchema.nullable(),
  from: monthSchema,
});

export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const budgetQuerySchema = z.object({ month: monthSchema });

/** A household budget in one month, with what the household spent against it. */
export const budgetSchema = z.object({
  categoryId: z.uuid(),
  amount: z.number().int().positive(),
  /** The month this amount was set from. */
  since: monthSchema,
  /** Shared expenses in the category that month (whole amounts, not shares). */
  spent: z.number().int().nonnegative(),
});

export type Budget = z.infer<typeof budgetSchema>;

export const budgetListSchema = z.object({
  month: monthSchema,
  currency: currencySchema,
  budgets: z.array(budgetSchema),
});

export type BudgetList = z.infer<typeof budgetListSchema>;

export const budgetListResponseSchema = z.object({ budgets: budgetListSchema });
export type BudgetListResponse = z.infer<typeof budgetListResponseSchema>;

/** Share of the budget used, for bars and "near the limit" (can exceed 1). */
export const budgetUsage = (budget: Pick<Budget, 'amount' | 'spent'>) =>
  budget.spent / budget.amount;

/** From this share on a budget counts as close to its limit. */
export const BUDGET_WARNING_RATIO = 0.8;
