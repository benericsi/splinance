import { type Budget, BUDGET_WARNING_RATIO, budgetUsage, type Currency } from '@splinance/shared';
import { formatMoney } from '@/features/transactions/money';

export type BudgetStatus = 'ok' | 'near' | 'over';

/** Over once spending passes the amount; near from 80%. */
export function budgetStatus(budget: Pick<Budget, 'amount' | 'spent'>): BudgetStatus {
  const usage = budgetUsage(budget);
  if (usage > 1) return 'over';
  return usage >= BUDGET_WARNING_RATIO ? 'near' : 'ok';
}

/** "17 600 Ft left", "3000 Ft left · 90%", "Over by 4000 Ft". */
export function budgetNote(budget: Pick<Budget, 'amount' | 'spent'>, currency: Currency): string {
  const left = budget.amount - budget.spent;
  if (left < 0) return `Over by ${formatMoney(-left, currency)}`;
  const note = `${formatMoney(left, currency)} left`;
  return budgetStatus(budget) === 'near'
    ? `${note} · ${String(Math.round(budgetUsage(budget) * 100))}%`
    : note;
}

/** Budgets that need attention first: most used on top. */
export const byUsage = (a: Budget, b: Budget) => budgetUsage(b) - budgetUsage(a);
