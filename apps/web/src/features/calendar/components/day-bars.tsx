import type { Calendar } from '@splinance/shared';
import { m, useReducedMotion } from 'motion/react';
import { TRANSITION, TRANSITION_GROW } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';
import { dayBars } from '../left';

/**
 * The viewer's share spent per day of the month: past days filled, today in the hero's
 * tone, days ahead as low stubs. Decoration only (the number and the chips say it in
 * words). Grows from the baseline once when the overview replaces its skeleton.
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
  const reveal = useReveal();
  const reducedMotion = useReducedMotion();
  const grow = reveal.active && !reducedMotion;
  return (
    <div
      className={cn('flex h-14 items-end gap-0.5', className)}
      aria-hidden
      data-testid="day-bars"
    >
      {dayBars(calendar).map((bar, index) => (
        <m.div
          key={bar.date}
          data-when={bar.when}
          className={cn(
            'min-w-0 flex-1 origin-bottom rounded-[2px]',
            bar.when === 'past' && 'bg-foreground/45',
            bar.when === 'today' && (over ? 'bg-negative' : 'bg-positive'),
            bar.when === 'future' && 'bg-foreground/15',
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
            grow ? { ...TRANSITION_GROW, delay: reveal.delay + 0.1 + index * 0.008 } : TRANSITION
          }
        />
      ))}
    </div>
  );
}
