import { addMonths, type Calendar, daysOfMonth } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatDateWith, fromIsoDate, today } from '@/features/transactions/dates';
import { MONEY_LOCALE } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import { calendarQueries } from '../queries';
import {
  type CalendarView,
  changeAgainst,
  daysElapsed,
  spendingDays,
  spentThrough,
  summarize,
} from '../view';
import { Stat } from './calendar-summary';

const percent = new Intl.NumberFormat(MONEY_LOCALE, {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

/**
 * One category's month in three numbers: what was spent on it, on how many days, and how
 * that compares with the same days of the month before ("vs 1–11 Oct"), so a month in
 * progress is not measured against a whole one.
 */
export function CategorySummary({
  householdId,
  calendar,
  categoryId,
  view,
}: {
  householdId: string;
  calendar: Calendar;
  categoryId: string;
  view: CalendarView;
}) {
  const { t } = useTranslation('calendar');
  const before = addMonths(calendar.month, -1);
  const { data: previous } = useSuspenseQuery(
    calendarQueries.month(householdId, before, categoryId),
  );
  const { spent } = summarize(calendar, view);
  const days = spendingDays(calendar, view);
  // A month still ahead has no days to compare: the whole month before stands in.
  const through = Math.min(
    daysElapsed(calendar.month, today()) || calendar.days.length,
    daysOfMonth(before).length,
  );
  const change = changeAgainst(
    spentThrough(calendar, view, through),
    spentThrough(previous, view, through),
  );
  const period = t('stats.period', {
    day: through,
    month: formatDateWith(fromIsoDate(`${before}-01`), { month: 'short' }),
  });

  return (
    <dl className="grid gap-2 max-sm:grid-cols-[repeat(3,auto)] sm:grid-cols-3 sm:gap-3">
      <Stat
        label={view === 'mine' ? t('stats.youSpent') : t('stats.spent')}
        value={<MoneyFlow minor={spent} currency={calendar.currency} />}
      />
      <Stat label={t('stats.days')} value={t('stats.dayCount', { count: days })} />
      <Stat
        label={t('stats.compare', { period })}
        value={
          change === 'new' ? t('stats.nothingThen') : change === null ? '–' : percent.format(change)
        }
        // More spent is the "money out" color, less the other one.
        className={cn(
          typeof change === 'number' && change > 0 && 'text-negative',
          typeof change === 'number' && change < 0 && 'text-positive',
        )}
      />
    </dl>
  );
}
