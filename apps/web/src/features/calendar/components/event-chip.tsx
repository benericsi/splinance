import type { CalendarEvent, Currency } from '@splinance/shared';
import { formatAmountInput } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import { EVENT_STYLES, eventName } from '../events';
import { type CalendarView, eventAmount } from '../view';

/** One event in a day's cell: its name, and the amount (no currency) where there is room. */
export function EventChip({
  event,
  view,
  currency,
  viewerId,
}: {
  event: CalendarEvent;
  view: CalendarView;
  currency: Currency;
  viewerId: string | undefined;
}) {
  const { className } = EVENT_STYLES[event.type];
  return (
    <span className={cn('flex gap-1 rounded-md px-1.5 py-0.5 text-xs/4', className)}>
      <span className="truncate">{eventName(event, viewerId)}</span>
      {/* Only where the cell is wide enough for a name next to it (the grid is the container). */}
      <span className="shrink-0 tabular-nums @max-4xl:hidden">
        {formatAmountInput(eventAmount(event, view), currency)}
      </span>
    </span>
  );
}
