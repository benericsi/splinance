import type { Budget } from '@splinance/shared';
import { budgetUsage } from '@splinance/shared';
import { cn } from '@/lib/utils';
import { budgetStatus } from '../status';

/**
 * How much of the budget is used. Neutral below 80%, mustard near the limit, red over it.
 * Brand colors are fills only; the text next to it says the same in words, so the bar is
 * decorative for screen readers.
 */
export function BudgetBar({ budget }: { budget: Pick<Budget, 'amount' | 'spent'> }) {
  const status = budgetStatus(budget);
  return (
    <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-200',
          status === 'ok' && 'bg-foreground/45',
          status === 'near' && 'bg-brand-mustard',
          status === 'over' && 'bg-brand-red',
        )}
        style={{ width: `${String(Math.min(100, budgetUsage(budget) * 100))}%` }}
      />
    </div>
  );
}
