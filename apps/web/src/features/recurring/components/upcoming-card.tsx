import type { RecurringList } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { today } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import { dueLabel, viewSeries } from '../view';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Overview: recurring payments due within a week (or a little late), soonest first, and a
 * nudge when there are suggestions to look at. Hidden when there is neither.
 */
export function UpcomingCard({
  householdId,
  data,
  memberCount,
}: {
  householdId: string;
  data: RecurringList;
  memberCount: number;
}) {
  const { t } = useTranslation('recurring');
  const now = today();
  const upcoming = data.series
    .map((series) => viewSeries(series, now, memberCount))
    .filter((view) => view.timing === 'due' || view.timing === 'soon')
    .sort((a, b) => a.daysUntil - b.daysUntil);
  const suggestions = data.suggestions.length;
  if (upcoming.length === 0 && suggestions === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('upcoming.title')}</CardTitle>
        <CardAction>
          <Link
            to="/h/$householdId/recurring"
            params={{ householdId }}
            className={buttonVariants({ variant: 'link', className: 'text-link h-auto px-0' })}
          >
            {t('upcoming.all')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length > 0 && (
          <ul className="space-y-2.5">
            {upcoming.map((view) => (
              <li
                key={view.series.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate">
                  {view.series.name}
                  <span
                    className={cn(
                      'ml-2 text-xs',
                      view.daysUntil < 0 ? 'text-negative' : 'text-muted-foreground',
                    )}
                  >
                    {capitalize(dueLabel(view))}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(view.series.latestAmount, data.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {suggestions > 0 && (
          <Link
            to="/h/$householdId/recurring"
            params={{ householdId }}
            className="text-link flex items-center gap-1.5 text-sm hover:underline"
          >
            <Sparkles className="size-3.5" aria-hidden />
            {t('upcoming.found', { count: suggestions })}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
