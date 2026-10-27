import { BRAND_COLORS, type Category, type Currency, type ReportCategory } from '@splinance/shared';
import { m, useReducedMotion } from 'motion/react';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { formatMoney } from '@/features/transactions/money';
import { REVEAL_ROW_STAGGER, TRANSITION, TRANSITION_GROW } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import type { ReportView } from './trend-chart';

/**
 * A month's or a year's spending per category, largest first: the category's tile and name, a bar in
 * its color, the amount and its share. Every bar carries a faint outline, since some brand
 * colors (cream, sky, mustard on light; blue on dark) barely stand out from the card.
 */
export function CategoryBreakdown({
  rows,
  categories,
  currency,
  view,
  periodLabel,
}: {
  /** The selected month's rows, or a year's added up per category. */
  rows: Omit<ReportCategory, 'month'>[];
  categories: Category[];
  currency: Currency;
  view: ReportView;
  /** "October 2026", or "2026" for a year. */
  periodLabel: string;
}) {
  const reveal = useReveal();
  const reducedMotion = useReducedMotion();
  const grow = reveal.active && !reducedMotion;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const items = rows
    .map((row) => ({
      key: row.categoryId ?? 'none',
      category: row.categoryId ? categoryById.get(row.categoryId) : undefined,
      uncategorized: row.categoryId === null,
      amount: view === 'mine' ? row.yourExpenses : row.expenses,
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const largest = items[0]?.amount ?? 0;

  if (items.length === 0) {
    return <p className="text-muted-foreground py-6 text-center">No spending in {periodLabel}.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">
          {view === 'mine' ? 'Your share' : 'Household'} total
        </span>
        <span className="font-medium tabular-nums">{formatMoney(total, currency)}</span>
      </div>
      <ul aria-label={`Spending by category in ${periodLabel}`} className="space-y-2.5">
        {items.map((item, index) => {
          const name = item.uncategorized
            ? 'No category'
            : (item.category?.name ?? 'Unknown category');
          const share = Math.round((item.amount / total) * 100);
          const width = `${String((item.amount / largest) * 100)}%`;
          return (
            <li
              key={item.key}
              className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <CategoryTile category={item.category} size="sm" />
                <span className="truncate">{name}</span>
              </span>
              <span
                className="bg-muted h-2.5 overflow-hidden rounded-full max-sm:col-span-2 max-sm:row-start-2"
                aria-hidden
              >
                <m.span
                  className="ring-foreground/20 block h-full rounded-full ring-1 ring-inset"
                  style={{
                    backgroundColor: item.category
                      ? BRAND_COLORS[item.category.color]
                      : 'var(--muted-foreground)',
                  }}
                  initial={grow ? { width: 0 } : false}
                  animate={{ width }}
                  transition={
                    grow
                      ? {
                          ...TRANSITION_GROW,
                          delay: reveal.delay + 0.1 + index * REVEAL_ROW_STAGGER,
                        }
                      : TRANSITION
                  }
                />
              </span>
              <span className="text-right text-sm tabular-nums">
                {formatMoney(item.amount, currency)}
                <span className="text-muted-foreground"> · {share}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
