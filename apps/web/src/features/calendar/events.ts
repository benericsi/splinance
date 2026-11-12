import type { CalendarEvent, Currency } from '@splinance/shared';
import {
  ArrowLeftRight,
  BanknoteArrowDown,
  CalendarClock,
  type LucideIcon,
  Repeat,
} from 'lucide-react';
import { formatMoney } from '@/features/transactions/money';
import { i18n } from '@/i18n';
import { type CalendarView, eventAmount } from './view';

/**
 * How each kind of event looks, in the grid, the legend and the day's dialog. Chrome
 * stays neutral: a found payment is a quiet fill, an expected one an outline (not real
 * yet), a settlement takes the "money in" role color, and so does recurring income (see
 * `eventStyle`). Every fill is opaque, so a chip reads the same on a tinted day as on a
 * plain one (text stays above 4.5:1).
 */
interface EventStyle {
  icon: LucideIcon;
  className: string;
}

const POSITIVE_FILL =
  'text-positive bg-[color-mix(in_oklab,var(--positive)_12%,var(--background))]';

/** Recurring income: received is the positive fill, expected the same outline in that color. */
export const INCOME_STYLES: Record<'recurringPaid' | 'recurringExpected', EventStyle> = {
  recurringPaid: { icon: BanknoteArrowDown, className: POSITIVE_FILL },
  recurringExpected: {
    icon: BanknoteArrowDown,
    className:
      'bg-background text-positive border border-dashed border-[color-mix(in_oklab,var(--positive)_55%,var(--background))]',
  },
};

/** The style of one event: by its type, and for a recurring one by whether it is income. */
export function eventStyle(event: CalendarEvent): EventStyle {
  return event.type !== 'settlement' && event.kind === 'income'
    ? INCOME_STYLES[event.type]
    : EVENT_STYLES[event.type];
}

export const EVENT_STYLES: Record<CalendarEvent['type'], EventStyle> = {
  recurringPaid: { icon: Repeat, className: 'bg-secondary text-secondary-foreground' },
  recurringExpected: {
    icon: CalendarClock,
    className: 'bg-background text-muted-foreground border-foreground/30 border border-dashed',
  },
  settlement: { icon: ArrowLeftRight, className: POSITIVE_FILL },
};

/** "Netflix", or who paid whom ("Ben paid you") for a settlement. */
export function eventName(event: CalendarEvent, viewerId: string | undefined): string {
  if (event.type !== 'settlement') return event.name;
  if (event.to.userId === viewerId) {
    return i18n.t('calendar:event.paidYou', { name: event.from.displayName });
  }
  if (event.from.userId === viewerId) {
    return i18n.t('calendar:event.youPaid', { name: event.to.displayName });
  }
  return i18n.t('calendar:event.paidOther', {
    from: event.from.displayName,
    to: event.to.displayName,
  });
}

/**
 * "4490 Ft", or "about 18 200 Ft" for an expected payment of a bill that varies; income
 * carries a plus.
 */
export function eventAmountText(
  event: CalendarEvent,
  view: CalendarView,
  currency: Currency,
): string {
  const sign = event.type !== 'settlement' && event.kind === 'income' ? '+' : '';
  const amount = `${sign}${formatMoney(eventAmount(event, view), currency)}`;
  return event.type === 'recurringExpected' && event.amountVaries
    ? i18n.t('calendar:event.about', { amount })
    : amount;
}
