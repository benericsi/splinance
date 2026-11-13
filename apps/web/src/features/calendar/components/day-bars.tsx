import type { Calendar, Currency, DaySetAside } from '@splinance/shared';
import { m, useReducedMotion } from 'motion/react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Amount } from '@/features/transactions/components/amount';
import { formatDayHeading } from '@/features/transactions/dates';
import { TRANSITION, TRANSITION_GROW } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';
import { type DayBar, dayBars, labelAlign } from '../left';

/** Set aside reads as savings in both themes: deep blue on the light tint, sky on the dark. */
const SET_ASIDE_FILL = 'bg-brand-blue/70 dark:bg-brand-sky';

/** Where the label's anchor sits, as a share of the bars' width, and how it hangs from it. */
function labelPosition(index: number, count: number) {
  const align = labelAlign(index, count);
  const at = align === 'start' ? index : align === 'end' ? index + 1 : index + 0.5;
  return {
    left: `${String((at / count) * 100)}%`,
    className: align === 'end' ? '-translate-x-full' : align === 'center' ? '-translate-x-1/2' : '',
  };
}

/** A day has something to say once spent, saved, earned or expected; days ahead often do not. */
const hasLabel = (bar: DayBar) =>
  bar.when !== 'future' || bar.expected > 0 || bar.expectedIncome > 0;

/**
 * The viewer's month by day under the hero's number: money out stacked (spent, then set
 * aside) on past days and today, a dot on days income arrived, and on days ahead dashed
 * stubs for recurring payments still expected (a ring for income still expected). Pointing
 * at a day (hover, or a tap on a phone, where the label stays until the next tap) shows its
 * parts. Decoration for assistive tech: the number and the chips say it in words, and the
 * calendar has every day for the keyboard. Grows from the baseline once when the overview
 * replaces its skeleton.
 */
export function DayBars({
  calendar,
  setAsideByDay,
  over,
  className,
}: {
  calendar: Calendar;
  setAsideByDay?: readonly DaySetAside[];
  over: boolean;
  className?: string;
}) {
  const reveal = useReveal();
  const reducedMotion = useReducedMotion();
  const grow = reveal.active && !reducedMotion;
  const bars = dayBars(calendar, setAsideByDay);
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
      {shown && pointed !== null && hasLabel(shown) && (
        <DayLabel
          bar={shown}
          currency={calendar.currency}
          {...labelPosition(pointed, bars.length)}
        />
      )}
      <div className="flex h-32 md:h-full md:min-h-32">
        {bars.map((bar, index) => (
          // The whole column is the target, so a one-pixel day is as easy to point at. The top
          // padding keeps room for an income dot over the tallest day.
          <div
            key={bar.date}
            className={cn(
              'flex h-full min-w-0 flex-1 flex-col justify-end px-px pt-3 transition-opacity sm:px-0.5',
              pointed !== null && pointed !== index && 'opacity-50',
            )}
            onPointerEnter={() => {
              setPointed(index);
            }}
            onPointerDown={() => {
              setPointed(index);
            }}
          >
            <DayColumn
              bar={bar}
              over={over}
              grow={grow}
              delay={reveal.delay + 0.1 + index * 0.008}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Income that came in, or (a ring) income still expected, sitting just over its day. */
function IncomeMark({ expected }: { expected: boolean }) {
  return (
    <span
      data-mark={expected ? 'expected-income' : 'income'}
      className={cn(
        'absolute bottom-full left-1/2 mb-1 size-2 -translate-x-1/2 rounded-full',
        expected ? 'border-positive border' : 'bg-positive',
      )}
    />
  );
}

function DayColumn({
  bar,
  over,
  grow,
  delay,
}: {
  bar: DayBar;
  over: boolean;
  grow: boolean;
  delay: number;
}) {
  if (bar.when === 'future') {
    return (
      <div
        className="relative w-full"
        style={{
          height: bar.expected > 0 ? `max(4px, ${String(bar.expectedTop * 100)}%)` : '3px',
        }}
      >
        {bar.expected > 0 ? (
          <div
            data-when="future"
            data-expected
            className="border-foreground/40 h-full w-full rounded-[2px] border border-dashed"
          />
        ) : (
          <div data-when="future" className="bg-foreground/15 h-full w-full rounded-[2px]" />
        )}
        {bar.expectedIncome > 0 && <IncomeMark expected />}
      </div>
    );
  }
  // Spent's share of the stack's height; the rest of it is what was set aside.
  const spentShare = bar.stackTop === 0 ? 1 : bar.spentTop / bar.stackTop;
  return (
    // The mark sits outside the growing bar, so it is not squashed while the bar grows.
    <div
      className="relative w-full"
      style={{
        height: `max(${bar.when === 'today' ? '6px' : '3px'}, ${String(bar.stackTop * 100)}%)`,
      }}
    >
      <m.div
        data-when={bar.when}
        className="flex h-full w-full origin-bottom flex-col gap-px"
        initial={grow ? { scaleY: 0 } : false}
        animate={{ scaleY: 1 }}
        transition={grow ? { ...TRANSITION_GROW, delay } : TRANSITION}
      >
        {spentShare < 1 && (
          <div
            data-part="set-aside"
            className={cn('min-h-px rounded-t-[2px]', SET_ASIDE_FILL)}
            style={{ height: `${String((1 - spentShare) * 100)}%` }}
          />
        )}
        <div
          data-part="spent"
          className={cn(
            'min-h-0 flex-1 rounded-[2px]',
            spentShare < 1 && 'rounded-t-none',
            bar.when === 'today' ? (over ? 'bg-negative' : 'bg-positive') : 'bg-foreground/45',
          )}
        />
      </m.div>
      {bar.income > 0 && <IncomeMark expected={false} />}
    </div>
  );
}

function DayLabel({
  bar,
  currency,
  left,
  className,
}: {
  bar: DayBar;
  currency: Currency;
  left: string;
  className: string;
}) {
  const { t } = useTranslation('calendar');
  const rows: { key: string; label: string; amount: number; positive?: boolean }[] =
    bar.when === 'future'
      ? [
          ...(bar.expected > 0
            ? [{ key: 'expected', label: t('bars.expected'), amount: bar.expected }]
            : []),
          ...(bar.expectedIncome > 0
            ? [
                {
                  key: 'expectedIncome',
                  label: t('bars.expectedIncome'),
                  amount: bar.expectedIncome,
                  positive: true,
                },
              ]
            : []),
        ]
      : [
          { key: 'spent', label: t('bars.spent'), amount: bar.spent },
          ...(bar.setAside !== 0
            ? [
                {
                  key: 'setAside',
                  label: t(bar.setAside > 0 ? 'bars.setAside' : 'bars.takenOut'),
                  amount: Math.abs(bar.setAside),
                },
              ]
            : []),
          ...(bar.income > 0
            ? [{ key: 'income', label: t('bars.income'), amount: bar.income, positive: true }]
            : []),
        ];

  return (
    <div
      data-testid="day-bar-label"
      className={cn(
        'bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute bottom-full z-10 mb-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md ring-1',
        className,
      )}
      style={{ left }}
    >
      <p className="text-muted-foreground mb-0.5">
        {bar.when === 'today' ? t('bars.today') : formatDayHeading(bar.date)}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        {rows.map((row) => (
          <Row key={row.key} label={row.label}>
            <span className={cn('font-medium tabular-nums', row.positive && 'text-positive')}>
              {row.positive && '+'}
              <Amount minor={row.amount} currency={currency} />
            </span>
          </Row>
        ))}
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </>
  );
}
