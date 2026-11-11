import type { CalendarEvent } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { RouteDialog } from '@/components/route-dialog';
import { EVENT_STYLES, eventAmountText, eventName } from '@/features/calendar/events';
import { calendarQueries } from '@/features/calendar/queries';
import { type CalendarView, daySpent } from '@/features/calendar/view';
import { categoryQueries } from '@/features/categories/queries';
import { TransactionRow } from '@/features/transactions/components/transaction-list';
import { formatDayHeading, today } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { transactionQueries } from '@/features/transactions/queries';
import { useAuth } from '@/lib/auth-store';
import { OPEN_MODAL_STATE, useCloseModal } from '@/lib/route-modal';
import { cn } from '@/lib/utils';

const dateSchema = z.iso.date();

/** Child route: one day (its events and transactions) over the calendar. */
export const Route = createFileRoute('/_authenticated/h/$householdId/calendar/$date')({
  loader: async ({ context: { queryClient }, params: { householdId, date } }) => {
    if (!dateSchema.safeParse(date).success) throw notFound();
    await Promise.all([
      queryClient.query(calendarQueries.month(householdId, date.slice(0, 7))),
      queryClient.query(transactionQueries.day(householdId, date)),
      queryClient.query(categoryQueries.list(householdId)),
    ]);
  },
  component: DayRoute,
});

function DayRoute() {
  const { t } = useTranslation('calendar');
  const { householdId, date } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const view: CalendarView = search.view ?? 'household';
  const { data: calendar } = useSuspenseQuery(calendarQueries.month(householdId, date.slice(0, 7)));
  const { data: transactions } = useSuspenseQuery(transactionQueries.day(householdId, date));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const events = calendar.events.filter((event) => event.date === date);
  const day = calendar.days.find((item) => item.date === date);
  const spent = day ? daySpent(day, view) : 0;

  const close = useCloseModal(
    useCallback(() => {
      void navigate({
        to: '/h/$householdId/calendar',
        params: { householdId },
        search: true,
        replace: true,
      });
    }, [navigate, householdId]),
  );

  return (
    <RouteDialog
      title={formatDayHeading(date)}
      description={
        spent > 0 ? t('dialog.spent', { amount: formatMoney(spent, calendar.currency) }) : undefined
      }
      onClose={close}
    >
      {events.length === 0 && transactions.length === 0 && (
        <p className="text-muted-foreground py-4 text-center">
          {date > today() ? t('dialog.emptyAhead') : t('dialog.empty')}
        </p>
      )}

      {events.length > 0 && (
        <section aria-label={t('dialog.marked')} className="mb-4">
          <h3 className="text-muted-foreground mb-1 text-xs font-medium">{t('dialog.marked')}</h3>
          <ul>
            {events.map((event, index) => (
              <li key={index}>
                <EventRow
                  householdId={householdId}
                  event={event}
                  view={view}
                  currency={calendar.currency}
                  viewerId={user?.id}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {transactions.length > 0 && (
        <section aria-label={t('dialog.transactions')}>
          <h3 className="text-muted-foreground mb-1 text-xs font-medium">
            {t('dialog.transactions')}
          </h3>
          <ul>
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow
                  householdId={householdId}
                  transaction={transaction}
                  category={
                    transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </RouteDialog>
  );
}

const KIND_LABEL = {
  recurringPaid: 'event.paid',
  recurringExpected: 'event.expected',
  settlement: 'event.settlement',
} as const;

/** An event with its kind and amount; a recurring one opens its series. */
function EventRow({
  householdId,
  event,
  view,
  currency,
  viewerId,
}: {
  householdId: string;
  event: CalendarEvent;
  view: CalendarView;
  currency: Parameters<typeof formatMoney>[1];
  viewerId: string | undefined;
}) {
  const { t } = useTranslation('calendar');
  const { icon: Icon, className } = EVENT_STYLES[event.type];
  const row = 'flex items-center gap-3 py-2.5';
  const content = (
    <>
      <span
        aria-hidden
        className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', className)}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{eventName(event, viewerId)}</span>
        <span className="text-muted-foreground block text-xs">{t(KIND_LABEL[event.type])}</span>
      </span>
      <span className="shrink-0 font-medium tabular-nums">
        {eventAmountText(event, view, currency)}
      </span>
    </>
  );
  if (event.type === 'settlement') return <div className={row}>{content}</div>;
  return (
    <Link
      to="/h/$householdId/recurring/$seriesId"
      params={{ householdId, seriesId: event.seriesId }}
      state={OPEN_MODAL_STATE}
      className={cn(
        row,
        'hover:bg-muted/60 focus-visible:ring-ring/50 -mx-1 rounded-lg px-1 outline-none focus-visible:ring-[3px]',
      )}
    >
      {content}
    </Link>
  );
}
