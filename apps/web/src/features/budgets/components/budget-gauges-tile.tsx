import { type BudgetList, budgetUsage, type Category } from '@splinance/shared';
import { useTranslation } from 'react-i18next';
import { Gauge } from '@/components/arc-charts';
import { TileBox, TileLink } from '@/components/tile';
import { MaskMoney } from '@/features/transactions/components/amount';
import { cn } from '@/lib/utils';
import { budgetNote, budgetStatus, gaugeBudgets } from '../status';

/**
 * Overview: a half gauge for each budget at 80% or more this month, most used first, two at
 * most with "+1 more" under them. Mustard near the limit, a full red arc over it. Hidden
 * when no budget is close, so the overview stays calm.
 */
export function BudgetGaugesTile({
  householdId,
  data,
  categories,
}: {
  householdId: string;
  data: BudgetList;
  categories: Category[];
}) {
  const { t } = useTranslation('budgets');
  const { shown, more } = gaugeBudgets(data.budgets);
  if (shown.length === 0) return null;
  const nameOf = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <TileBox
      title={t('alerts.title')}
      action={
        <TileLink
          to="/h/$householdId/budgets"
          params={{ householdId }}
          aria-label={t('alerts.all')}
        />
      }
    >
      <ul className="grid grid-cols-2 gap-4">
        {shown.map((budget) => {
          const over = budgetStatus(budget) === 'over';
          return (
            <li key={budget.categoryId} className="min-w-0 text-center">
              <Gauge
                ratio={budgetUsage(budget)}
                strokeClassName={over ? 'stroke-brand-red' : 'stroke-brand-mustard'}
                className="mx-auto max-w-36"
              >
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {Math.round(budgetUsage(budget) * 100)}%
                </span>
              </Gauge>
              <p className="mt-2 truncate font-medium">
                {nameOf.get(budget.categoryId) ?? t('unknown')}
              </p>
              <p
                className={cn(
                  'text-xs tabular-nums',
                  over ? 'text-negative' : 'text-muted-foreground',
                )}
              >
                <MaskMoney>{budgetNote(budget, data.currency)}</MaskMoney>
              </p>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          {t('alerts.more', { count: more })}
        </p>
      )}
    </TileBox>
  );
}
