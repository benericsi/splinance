import type { RecurringList } from '@splinance/shared';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TileBox, TileLink } from '@/components/tile';
import { Amount } from '@/features/transactions/components/amount';
import { today } from '@/features/transactions/dates';
import { cn } from '@/lib/utils';
import { comingUp, dueLabel, signFor } from '../view';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Overview: the soonest recurring payment due, or income expected, within a week (or a
 * little late) as one number, and how many more the week holds. Hidden when there is none.
 */
export function ComingUpTile({
  householdId,
  data,
  memberCount,
}: {
  householdId: string;
  data: RecurringList;
  memberCount: number;
}) {
  const { t } = useTranslation('recurring');
  const { next, more } = comingUp(data.series, today(), memberCount);
  if (!next) return null;
  const { series } = next;

  return (
    <TileBox
      title={t('upcoming.title')}
      action={
        <TileLink
          to="/h/$householdId/recurring"
          params={{ householdId }}
          aria-label={t('upcoming.all')}
        />
      }
    >
      <p
        className={cn(
          'font-heading text-2xl font-semibold tracking-tight tabular-nums',
          series.kind === 'income' && 'text-positive',
        )}
      >
        {signFor(series.kind)}
        <Amount minor={series.latestAmount} currency={data.currency} />
      </p>
      <p className="mt-1 truncate font-medium">{series.name}</p>
      <p className={cn('text-xs', next.daysUntil < 0 ? 'text-negative' : 'text-muted-foreground')}>
        {capitalize(dueLabel(next, series.kind))}
      </p>
      {more > 0 && (
        <p className="text-muted-foreground mt-auto pt-2 text-xs">
          {t('upcoming.more', { count: more })}
        </p>
      )}
    </TileBox>
  );
}

/** Overview: how many possible recurring payments wait for a look. Hidden when none do. */
export function ToReviewTile({ householdId, data }: { householdId: string; data: RecurringList }) {
  const { t } = useTranslation('recurring');
  const count = data.suggestions.length;
  if (count === 0) return null;

  return (
    <TileBox
      title={t('review.title')}
      action={
        <TileLink
          to="/h/$householdId/recurring"
          params={{ householdId }}
          aria-label={t('review.link')}
        />
      }
    >
      <p className="font-heading flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums">
        {count}
        <Sparkles className="text-muted-foreground size-4" aria-hidden />
      </p>
      <p className="text-muted-foreground mt-1">{t('review.text', { count })}</p>
    </TileBox>
  );
}
