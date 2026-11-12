import type { Category, Currency } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { formatMoney } from '@/features/transactions/money';
import { useRevealRows } from '@/lib/reveal';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { cadenceLabel, dueLabel, formatChange, type SeriesView, shortDate, signFor } from '../view';
import { Amount, MaskMoney } from '@/features/transactions/components/amount';

/**
 * The viewer's recurring payments, or their recurring income, soonest first. A row opens the
 * series (payments, edit, stop tracking); one gone quiet asks whether it was cancelled.
 * Income reads the other way round: its amount is money in, and a rise is good news.
 */
export function SeriesList({
  householdId,
  views,
  categories,
  currency,
}: {
  householdId: string;
  views: SeriesView[];
  categories: Category[];
  currency: Currency;
}) {
  const { t } = useTranslation('recurring');
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const reveal = useRevealRows();

  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      <AnimatePresence initial={reveal.active}>
        {views.map((view, index) => {
          const { series, timing, change } = view;
          const category = series.categoryId ? categoryById.get(series.categoryId) : undefined;
          const lapsed = timing === 'lapsed';
          const income = series.kind === 'income';
          return (
            <m.li key={series.id} {...reveal.rowProps(index)}>
              <Link
                from="/h/$householdId/recurring"
                to="/h/$householdId/recurring/$seriesId"
                params={{ householdId, seriesId: series.id }}
                state={OPEN_MODAL_STATE}
                className="hover:bg-muted/40 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
              >
                <CategoryTile category={category} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{series.name}</span>
                    {series.scope === 'private' && (
                      <Lock
                        className="text-muted-foreground size-3 shrink-0"
                        aria-label={t('onlyYou')}
                      />
                    )}
                    {change !== null && !lapsed && (
                      <span
                        className={cn(
                          'bg-muted shrink-0 rounded-full px-1.5 text-xs font-normal tabular-nums',
                          change > 0 === income ? 'text-positive' : 'text-negative',
                        )}
                        title={t(income ? 'changeIncome' : 'change')}
                      >
                        {formatChange(change)}
                      </span>
                    )}
                  </p>
                  {lapsed ? (
                    <p className="text-negative text-xs">
                      {series.lastPaidOn
                        ? t(income ? 'noIncomeSince' : 'noPaymentSince', {
                            date: shortDate(series.lastPaidOn),
                          })
                        : t(income ? 'noIncomeYet' : 'noPaymentYet')}
                    </p>
                  ) : (
                    <p className="text-muted-foreground truncate text-xs">
                      {cadenceLabel(series.cadence)} · {dueLabel(view, series.kind)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p
                    className={cn(
                      'font-medium',
                      lapsed ? 'text-muted-foreground' : income && 'text-positive',
                    )}
                  >
                    {signFor(series.kind)}
                    <Amount minor={series.latestAmount} currency={currency} />
                  </p>
                  {series.scope === 'shared' && series.share !== null && (
                    <p className="text-muted-foreground text-xs">
                      <MaskMoney>
                        {t('yourPart', { amount: formatMoney(series.share, currency) })}
                      </MaskMoney>
                    </p>
                  )}
                </div>
              </Link>
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
