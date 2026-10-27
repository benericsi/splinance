import type { BudgetList as BudgetListData, Category } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, m } from 'motion/react';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatMoney } from '@/features/transactions/money';
import { useRevealRows } from '@/lib/reveal';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { budgetNote, budgetStatus } from '../status';
import { BudgetBar } from './budget-bar';

/**
 * A month's budgets: totals (budgeted, spent, left) and one row per budget with a bar,
 * sorted by category name. A row opens the dialog to change or remove it.
 */
export function BudgetList({
  householdId,
  data,
  categories,
}: {
  householdId: string;
  data: BudgetListData;
  categories: Category[];
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rows = data.budgets
    .map((budget) => ({ budget, category: categoryById.get(budget.categoryId) }))
    .sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'hu'));
  const budgeted = data.budgets.reduce((sum, b) => sum + b.amount, 0);
  const spent = data.budgets.reduce((sum, b) => sum + b.spent, 0);
  const left = budgeted - spent;
  const reveal = useRevealRows();

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3">
        <Total label="Budgeted" minor={budgeted} currency={data.currency} />
        <Total label="Spent" minor={spent} currency={data.currency} />
        <Total
          label={left < 0 ? 'Over' : 'Left'}
          minor={Math.abs(left)}
          currency={data.currency}
          className={left < 0 ? 'text-negative' : undefined}
        />
      </dl>

      {/* Rows fill the list edge to edge (hover included) and the list clips them to its
          rounded corners: no negative margins, which an animating row (overflow hidden while
          it moves) would cut off. */}
      <ul className="divide-y overflow-hidden rounded-xl border">
        <AnimatePresence initial={reveal.active}>
          {rows.map(({ budget, category }, index) => {
            const status = budgetStatus(budget);
            return (
              <m.li key={budget.categoryId} {...reveal.rowProps(index)}>
                <Link
                  from="/h/$householdId/budgets"
                  to="/h/$householdId/budgets/set"
                  params={{ householdId }}
                  search={(prev) => ({ ...prev, category: budget.categoryId })}
                  state={OPEN_MODAL_STATE}
                  className="hover:bg-muted/40 focus-visible:ring-ring/50 block px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
                >
                  <div className="flex items-center gap-3">
                    <CategoryTile category={category} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {category?.name ?? 'Unknown'}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(budget.spent, data.currency)}
                      <span className="text-muted-foreground">
                        {' '}
                        / {formatMoney(budget.amount, data.currency)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <BudgetBar budget={budget} />
                    <p
                      className={cn(
                        'text-xs tabular-nums',
                        status === 'over' ? 'text-negative' : 'text-muted-foreground',
                      )}
                    >
                      {budgetNote(budget, data.currency)}
                    </p>
                  </div>
                </Link>
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <p className="text-muted-foreground text-xs">
        Only shared expenses count. Private ones stay out of budgets.
      </p>
    </div>
  );
}

function Total({
  label,
  minor,
  currency,
  className,
}: {
  label: string;
  minor: number;
  currency: BudgetListData['currency'];
  className?: string | undefined;
}) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-lg px-2.5 py-2.5 sm:px-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('truncate text-sm font-semibold tabular-nums sm:text-lg', className)}>
        <MoneyFlow minor={minor} currency={currency} />
      </dd>
    </div>
  );
}
