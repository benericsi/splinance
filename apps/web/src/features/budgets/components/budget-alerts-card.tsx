import type { BudgetList, Category } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { budgetNote, budgetStatus, byUsage } from '../status';
import { BudgetBar } from './budget-bar';

/**
 * Overview: only the budgets at 80% or more this month, most used first. Hidden when none
 * are, so the overview stays calm.
 */
export function BudgetAlertsCard({
  householdId,
  data,
  categories,
}: {
  householdId: string;
  data: BudgetList;
  categories: Category[];
}) {
  const close = data.budgets.filter((budget) => budgetStatus(budget) !== 'ok').sort(byUsage);
  if (close.length === 0) return null;
  const nameOf = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets this month</CardTitle>
        <CardAction>
          <Link
            to="/h/$householdId/budgets"
            params={{ householdId }}
            className={buttonVariants({ variant: 'link', className: 'text-link h-auto px-0' })}
          >
            All budgets
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {close.map((budget) => (
            <li key={budget.categoryId} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{nameOf.get(budget.categoryId) ?? 'Unknown'}</span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    budgetStatus(budget) === 'over' ? 'text-negative' : 'text-muted-foreground',
                  )}
                >
                  {budgetNote(budget, data.currency)}
                </span>
              </div>
              <BudgetBar budget={budget} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
