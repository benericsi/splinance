import type { Calendar, CalendarDay, CalendarEvent, Category } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CategoryTile } from '@/features/categories/components/category-tile';
import {
  formatDateWith,
  formatMonth,
  fromIsoDate,
  today as browserToday,
} from '@/features/transactions/dates';
import { formatAmountInput, formatMoney } from '@/features/transactions/money';
import { useAuth } from '@/lib/auth-store';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { type CalendarView, daySpent, eventsByDate, leadingBlanks, spendLevel } from '../view';
import { EVENT_STYLES, INCOME_STYLES } from '../events';
import { EventChip } from './event-chip';

/** A Monday: the week's days are named from here on. */
const A_MONDAY = new Date(2024, 0, 1);

function weekdayNames(format: 'short' | 'long'): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    formatDateWith(new Date(A_MONDAY.getFullYear(), 0, A_MONDAY.getDate() + index), {
      weekday: format,
    }),
  );
}

/**
 * The tint of a day by its spend level: the "money out" role color mixed into the cell,
 * light enough that text keeps its contrast in both themes (checked at the darkest step).
 */
const LEVEL_TINT = ['', '6%', '10%', '15%', '20%'];

const tintOf = (level: number) =>
  level > 0
    ? {
        backgroundColor: `color-mix(in oklab, var(--negative) ${LEVEL_TINT[level] ?? '20%'}, transparent)`,
      }
    : undefined;

/**
 * The month as weeks from Monday. Each day is a link to its dialog: the day number, what
 * was spent, a tint by how much, and its events (the first as a chip, the rest counted).
 * Phones have no room for chips: a dot per event, the details in the day's drawer.
 * Showing one category, its days carry the category's tile, so the month reads as
 * "which days", not only "how much".
 */
export function CalendarGrid({
  householdId,
  calendar,
  view,
  category,
}: {
  householdId: string;
  calendar: Calendar;
  view: CalendarView;
  /** The category the calendar is narrowed to, if any. */
  category?: Category | undefined;
}) {
  const { t } = useTranslation('calendar');
  const { user } = useAuth();
  const events = eventsByDate(calendar.events);
  const max = Math.max(0, ...calendar.days.map((day) => daySpent(day, view)));
  const today = browserToday();
  const short = weekdayNames('short');

  return (
    <div className="bg-border @container overflow-hidden rounded-xl border">
      <div aria-hidden className="bg-border grid grid-cols-7 gap-px border-b">
        {short.map((name) => (
          <div
            key={name}
            className="bg-background text-muted-foreground py-1.5 text-center text-xs font-medium"
          >
            {name}
          </div>
        ))}
      </div>
      <ol
        aria-label={t('grid.label', { month: formatMonth(calendar.month) })}
        className="grid grid-cols-7 gap-px"
      >
        {Array.from({ length: leadingBlanks(calendar.month) }, (_, index) => (
          <li key={`before-${String(index)}`} aria-hidden className="bg-background" />
        ))}
        {calendar.days.map((day) => (
          <li key={day.date} className="bg-background min-w-0">
            <DayCell
              householdId={householdId}
              day={day}
              events={events.get(day.date) ?? []}
              view={view}
              currency={calendar.currency}
              level={spendLevel(daySpent(day, view), max)}
              isToday={day.date === today}
              isAhead={day.date > today}
              viewerId={user?.id}
              category={category}
            />
          </li>
        ))}
        {/* The last week filled up, so the grid's lines close. */}
        {Array.from(
          { length: (7 - ((leadingBlanks(calendar.month) + calendar.days.length) % 7)) % 7 },
          (_, index) => (
            <li key={`after-${String(index)}`} aria-hidden className="bg-background" />
          ),
        )}
      </ol>
    </div>
  );
}

function DayCell({
  householdId,
  day,
  events,
  view,
  currency,
  level,
  isToday,
  isAhead,
  viewerId,
  category,
}: {
  householdId: string;
  day: CalendarDay;
  events: CalendarEvent[];
  view: CalendarView;
  currency: Calendar['currency'];
  level: number;
  isToday: boolean;
  isAhead: boolean;
  viewerId: string | undefined;
  category: Category | undefined;
}) {
  const { t } = useTranslation('calendar');
  const spent = daySpent(day, view);
  const marked = category !== undefined && spent > 0;
  const [first, ...rest] = events;

  const details = [
    ...(isToday ? [t('day.today')] : []),
    ...(spent > 0 ? [t('day.spent', { amount: formatMoney(spent, currency) })] : []),
    ...(events.length > 0 ? [t('day.events', { count: events.length })] : []),
  ];
  const label = t('day.label', {
    date: formatDateWith(fromIsoDate(day.date), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    details: details.length > 0 ? details.join(', ') : t('day.nothing'),
  });

  return (
    <Link
      to="/h/$householdId/calendar/$date"
      params={{ householdId, date: day.date }}
      search={true}
      state={OPEN_MODAL_STATE}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      style={tintOf(level)}
      className="hover:ring-foreground/20 focus-visible:ring-ring/50 flex h-14 flex-col gap-1 p-1 outline-none hover:ring-2 hover:ring-inset focus-visible:ring-[3px] focus-visible:ring-inset sm:h-24 sm:p-1.5"
    >
      <span className="flex items-center gap-1">
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
            isToday && 'bg-primary text-primary-foreground font-semibold',
            !isToday && isAhead && 'text-muted-foreground',
          )}
        >
          {Number(day.date.slice(8))}
        </span>
        {marked && <CategoryTile category={category} size="sm" className="max-sm:hidden" />}
        {spent > 0 && (
          // The number alone: the currency is in the totals above, and a narrow cell
          // has no room for it.
          <span className="text-foreground/80 ml-auto truncate text-xs tabular-nums max-sm:hidden">
            {formatAmountInput(spent, currency)}
          </span>
        )}
      </span>

      {first && (
        <span className="flex min-w-0 flex-col gap-0.5 max-sm:hidden">
          <EventChip event={first} view={view} currency={currency} viewerId={viewerId} />
          {rest.length > 0 && (
            <span className="text-foreground/70 px-1.5 text-xs/4">
              {t('day.more', { count: rest.length })}
            </span>
          )}
        </span>
      )}

      {(marked || events.length > 0) && (
        <span className="flex flex-wrap items-center justify-center gap-0.5 sm:hidden">
          {marked && (
            <CategoryTile
              category={category}
              size="sm"
              className="size-4 rounded-sm [&_svg]:size-2.5"
            />
          )}
          {events.slice(0, 3).map((event, index) => (
            <span key={index} className={cn('size-1.5 rounded-full', eventDot(event))} />
          ))}
        </span>
      )}
    </Link>
  );
}

/** The phone's dot per event: filled for what happened, a ring for what is expected. */
const EVENT_DOTS: Record<CalendarEvent['type'], string> = {
  recurringPaid: 'bg-foreground/70',
  recurringExpected: 'border-foreground/60 border',
  settlement: 'bg-positive',
};

/** Recurring income takes the "money in" color, received or still expected. */
function eventDot(event: CalendarEvent): string {
  if (event.type === 'settlement' || event.kind === 'expense') return EVENT_DOTS[event.type];
  return event.type === 'recurringPaid' ? 'bg-positive' : 'border-positive border';
}

/**
 * What the chips and the tint mean, under the grid. Recurring income gets its line only in
 * a month that has some.
 */
export function CalendarLegend({ income = false }: { income?: boolean }) {
  const { t } = useTranslation('calendar');
  const items = [
    { type: 'recurringPaid', label: t('legend.paid'), style: EVENT_STYLES.recurringPaid },
    {
      type: 'recurringExpected',
      label: t('legend.expected'),
      style: EVENT_STYLES.recurringExpected,
    },
    ...(income
      ? [{ type: 'income', label: t('legend.income'), style: INCOME_STYLES.recurringPaid }]
      : []),
    { type: 'settlement', label: t('legend.settlement'), style: EVENT_STYLES.settlement },
  ];
  return (
    <ul
      aria-label={t('legend.label')}
      className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
    >
      {items.map(({ type, label, style }) => {
        const { icon: Icon, className } = style;
        return (
          <li key={type} className="flex items-center gap-1.5">
            <span className={cn('flex size-5 items-center justify-center rounded-md', className)}>
              <Icon className="size-3" aria-hidden />
            </span>
            {label}
          </li>
        );
      })}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="flex overflow-hidden rounded-md border">
          {[1, 2, 3, 4].map((level) => (
            <span key={level} className="size-3" style={tintOf(level)} />
          ))}
        </span>
        {t('legend.spending')}
      </li>
    </ul>
  );
}
