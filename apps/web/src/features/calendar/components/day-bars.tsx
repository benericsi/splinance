import type { Calendar } from '@splinance/shared';
import { m, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Amount } from '@/features/transactions/components/amount';
import { formatDayHeading } from '@/features/transactions/dates';
import { TRANSITION, TRANSITION_GROW } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';
import { dayBars, labelAlign } from '../left';

const ALIGN = {
  start: 'left-0',
  center: '-translate-x-1/2',
  end: '-translate-x-full',
} as const;

/**
 * The viewer's share spent per day of the month: past days filled, today in the hero's
 * tone, days ahead as low stubs. Pointing at a day (hover, or a tap on a phone) shows its
 * date and amount above the bars. Decoration for assistive tech: the number and the chips
 * say it in words, and the calendar has every day for the keyboard. Grows from the
 * baseline once when the overview replaces its skeleton.
 */
export function DayBars({
  calendar,
  over,
  className,
}: {
  calendar: Calendar;
  over: boolean;
  className?: string;
}) {
  const { t } = useTranslation('calendar');
  const reveal = useReveal();
  const reducedMotion = useReducedMotion();
  const grow = reveal.active && !reducedMotion;
  const bars = dayBars(calendar);
  const [pointed, setPointed] = useState<number | null>(null);
  const shown = pointed === null ? undefined : bars[pointed];

  return (
    <div
      className={cn('relative', className)}
      aria-hidden
      data-testid="day-bars"
      onPointerLeave={(event) => {
        // A touch "leaves" as soon as the finger lifts: keep the tapped day's label.
        if (event.pointerType !== 'touch') setPointed(null);
      }}
    >
      {shown && shown.when !== 'future' && pointed !== null && (
        <div
          data-testid="day-bar-label"
          className={cn(
            'bg-popover text-popover-foreground pointer-events-none absolute bottom-full mb-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-md ring-1 ring-foreground/10',
            ALIGN[labelAlign(pointed, bars.length)],
          )}
          style={
            labelAlign(pointed, bars.length) === 'start'
              ? undefined
              : { left: `${String(((pointed + 0.5) / bars.length) * 100)}%` }
          }
        >
          <span className="text-muted-foreground">
            {shown.when === 'today' ? t('bars.today') : formatDayHeading(shown.date)}
          </span>{' '}
          <Amount
            minor={shown.amount}
            currency={calendar.currency}
            className="font-medium tabular-nums"
          />
        </div>
      )}
      <div className="flex h-14 items-end">
        {bars.map((bar, index) => (
          // The whole column is the target, so a one-pixel day is as easy to point at.
          <div
            key={bar.date}
            className="flex h-full min-w-0 flex-1 items-end px-px"
            onPointerEnter={() => {
              setPointed(index);
            }}
            onPointerDown={() => {
              setPointed(index);
            }}
          >
            <m.div
              data-when={bar.when}
              className={cn(
                'w-full origin-bottom rounded-[2px] transition-opacity',
                bar.when === 'past' && 'bg-foreground/45',
                bar.when === 'today' && (over ? 'bg-negative' : 'bg-positive'),
                bar.when === 'future' && 'bg-foreground/15',
                pointed !== null && pointed !== index && bar.when !== 'future' && 'opacity-60',
              )}
              style={{
                height:
                  bar.when === 'future'
                    ? 3
                    : `max(${bar.when === 'today' ? '6px' : '3px'}, ${String(bar.level * 100)}%)`,
              }}
              initial={grow ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={
                grow
                  ? { ...TRANSITION_GROW, delay: reveal.delay + 0.1 + index * 0.008 }
                  : TRANSITION
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
