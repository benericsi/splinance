import { Link } from '@tanstack/react-router';
import { CalendarDays, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Phones only: the bottom bar has no room for a seventh tab, so the calendar shares the
 * Transactions tab, and this switch moves between the month's list and its calendar.
 * Links, not buttons: each view is a page of its own. The month carries over.
 */
export function ActivityViewSwitch({
  householdId,
  active,
  month,
}: {
  householdId: string;
  active: 'list' | 'calendar';
  /** The month on screen; undefined for the current one (no `?month=`). */
  month: string | undefined;
}) {
  const { t } = useTranslation('calendar');
  const item = (current: boolean) =>
    cn(
      'focus-visible:ring-ring/50 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px]',
      current
        ? 'bg-background text-foreground dark:bg-input/50 shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );
  return (
    <nav
      aria-label={t('switch.label')}
      className="bg-muted mb-4 flex gap-0.5 rounded-lg p-0.5 md:hidden"
    >
      <Link
        to="/h/$householdId/transactions"
        params={{ householdId }}
        search={{ month }}
        aria-current={active === 'list' ? 'page' : undefined}
        className={item(active === 'list')}
      >
        <List className="size-4" aria-hidden />
        {t('switch.list')}
      </Link>
      <Link
        to="/h/$householdId/calendar"
        params={{ householdId }}
        search={{ month }}
        aria-current={active === 'calendar' ? 'page' : undefined}
        className={item(active === 'calendar')}
      >
        <CalendarDays className="size-4" aria-hidden />
        {t('switch.calendar')}
      </Link>
    </nav>
  );
}
