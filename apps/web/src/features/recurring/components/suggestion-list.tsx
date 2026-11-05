import type { Category, Currency, RecurringSuggestion } from '@splinance/shared';
import { Lock } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { formatMoney } from '@/features/transactions/money';
import { useRevealRows } from '@/lib/reveal';
import { useConfirmSuggestion, useDismissSuggestion } from '../hooks';
import { cadenceLabel, shortDate } from '../view';

/**
 * What detection noticed and nobody decided on yet: Confirm makes it a series, Not
 * recurring hides it (with an undo).
 */
export function SuggestionList({
  householdId,
  suggestions,
  categories,
  currency,
}: {
  householdId: string;
  suggestions: RecurringSuggestion[];
  categories: Category[];
  currency: Currency;
}) {
  const { t } = useTranslation('recurring');
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const confirm = useConfirmSuggestion();
  const dismiss = useDismissSuggestion();
  const reveal = useRevealRows();
  const busy = confirm.isPending || dismiss.isPending;

  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      <AnimatePresence initial={reveal.active}>
        {suggestions.map((suggestion, index) => {
          const decision = { scope: suggestion.scope, key: suggestion.key };
          const category = suggestion.categoryId
            ? categoryById.get(suggestion.categoryId)
            : undefined;
          return (
            <m.li
              key={`${suggestion.scope}:${suggestion.key}`}
              {...reveal.rowProps(index)}
              // Wraps on narrow screens: the buttons move under the text.
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                <CategoryTile category={category} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{suggestion.description}</span>
                    {suggestion.scope === 'private' && (
                      <Lock
                        className="text-muted-foreground size-3 shrink-0"
                        aria-label={t('onlyYou')}
                      />
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {t('suggestion.detail', {
                      cadence: cadenceLabel(suggestion.cadence),
                      count: suggestion.occurrences,
                      date: shortDate(suggestion.firstOn),
                    })}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatMoney(suggestion.amount, currency)}
                </span>
              </div>
              <div className="ml-auto flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={t('suggestion.notRecurringLabel', { name: suggestion.description })}
                  onClick={() => {
                    dismiss.mutate({ householdId, decision });
                  }}
                >
                  {t('suggestion.notRecurring')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  aria-label={t('suggestion.confirmLabel', { name: suggestion.description })}
                  onClick={() => {
                    confirm.mutate({ householdId, decision });
                  }}
                >
                  {t('suggestion.confirm')}
                </Button>
              </div>
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
