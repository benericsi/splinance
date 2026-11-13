import { type Budget, BUDGET_WARNING_RATIO, budgetUsage, type Currency } from '@splinance/shared';
import { formatMoney } from '@/features/transactions/money';
import { i18n } from '@/i18n';

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
  if (left < 0) return i18n.t('budgets:note.over', { amount: formatMoney(-left, currency) });
  const note = i18n.t('budgets:note.left', { amount: formatMoney(left, currency) });
  return budgetStatus(budget) === 'near'
    ? `${note} · ${String(Math.round(budgetUsage(budget) * 100))}%`
    : note;
}

/** Budgets that need attention first: most used on top. */
export const byUsage = (a: Budget, b: Budget) => budgetUsage(b) - budgetUsage(a);

/** The overview's budget tile has room for this many gauges. */
export const MAX_GAUGES = 2;

/**
 * The overview's budgets: this month's at 80% or more, most used first, the first
 * `MAX_GAUGES` drawn and the rest counted ("+1 more").
 */
export function gaugeBudgets(budgets: readonly Budget[]): { shown: Budget[]; more: number } {
  const close = budgets.filter((budget) => budgetStatus(budget) !== 'ok').sort(byUsage);
  return { shown: close.slice(0, MAX_GAUGES), more: Math.max(0, close.length - MAX_GAUGES) };
}
