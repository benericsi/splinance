import type { Calendar } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from '@/components/collapse';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatShortDate } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { type LeftSegment, leftSegments, leftThisMonth } from '../left';

/** Fills only: the legend next to the bar says the same in words. */
const SEGMENT_FILL: Record<LeftSegment['key'], string> = {
  spent: 'bg-foreground',
  toCome: 'bg-foreground/45',
  left: 'bg-positive',
  covered: 'bg-foreground',
  over: 'bg-brand-red',
};

/**
 * Overview: what is left of the viewer's income this month after what they spent and the
 * recurring payments still expected, as one number, a bar and (on request) the sum behind
 * it. Without any income to measure against it offers to track a salary instead.
 */
export function LeftThisMonthCard({
  householdId,
  calendar,
}: {
  householdId: string;
  calendar: Calendar;
}) {
  const { t } = useTranslation('calendar');
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const detailsId = useId();
  const month = leftThisMonth(calendar);
  const { currency } = calendar;
  const money = (minor: number) => formatMoney(minor, currency);

  if (!month) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">{t('left.nudge.title')}</h2>
            <p className="text-muted-foreground">{t('left.nudge.text')}</p>
          </div>
          <Link
            to="/h/$householdId/recurring/new"
            params={{ householdId }}
            search={{ kind: 'income' }}
            state={OPEN_MODAL_STATE}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('left.nudge.action')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const over = month.left < 0;
  const segments = leftSegments(month);
  const note = over
    ? month.toCome > 0
      ? t('left.overNote', { amount: money(month.toCome) })
      : null
    : month.nextIncome
      ? t('left.awaiting', {
          name: month.nextIncome.name,
          amount: money(month.nextIncome.amount),
          date: formatShortDate(month.nextIncome.date),
        })
      : t('left.perDay', { count: month.daysLeft, amount: money(month.perDay ?? 0) });

  return (
    <Card>
      <CardContent>
        <section aria-labelledby={headingId}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={headingId} className="text-muted-foreground text-sm">
              {over ? t('left.overTitle') : t('left.title')}
            </h2>
            <Link
              to="/h/$householdId/calendar"
              params={{ householdId }}
              search={{ view: 'mine' }}
              className="text-link shrink-0 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('left.month')}
            </Link>
          </div>
          <p
            className={cn(
              'font-heading mt-1 text-4xl font-semibold tracking-tight tabular-nums',
              over && 'text-negative',
            )}
          >
            <MoneyFlow minor={Math.abs(month.left)} currency={currency} />
          </p>
          {note && <p className="text-muted-foreground mt-1">{note}</p>}

          {/* Each slice grows by its amount; a small one keeps 4 px so it never vanishes. */}
          <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {segments.map((segment) => (
              <div
                key={segment.key}
                className={cn(
                  'min-w-1 basis-0 transition-[flex-grow] duration-200 motion-reduce:transition-none',
                  SEGMENT_FILL[segment.key],
                )}
                style={{ flexGrow: segment.amount }}
              />
            ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {segments.map((segment) => (
              <li key={segment.key} className="flex items-center gap-1.5">
                <span
                  className={cn('size-2 shrink-0 rounded-[2px]', SEGMENT_FILL[segment.key])}
                  aria-hidden
                />
                <span className="text-muted-foreground">{t(`left.legend.${segment.key}`)}</span>
                <span className="tabular-nums">{money(segment.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t pt-3">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => {
                setOpen((value) => !value);
              }}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center gap-1 rounded-sm text-sm outline-none focus-visible:ring-2"
            >
              <ChevronRight
                className={cn('size-4 transition-transform', open && 'rotate-90')}
                aria-hidden
              />
              {t('left.how')}
            </button>
            <div id={detailsId}>
              <Collapse open={open}>
                <dl className="space-y-1.5 pt-3 text-sm">
                  <Row label={t('left.rows.received')}>
                    <span className={cn(month.received > 0 && 'text-positive')}>
                      {formatMoney(month.received, currency, { signed: month.received > 0 })}
                    </span>
                  </Row>
                  {month.expectedIncome > 0 && (
                    <Row label={t('left.rows.expectedIncome')}>
                      <span className="text-positive">
                        {formatMoney(month.expectedIncome, currency, { signed: true })}
                      </span>
                    </Row>
                  )}
                  <Row label={t('left.rows.spent')}>{money(-month.spent)}</Row>
                  {month.toCome > 0 && (
                    <Row label={t('left.rows.toCome', { count: month.toComeCount })}>
                      {month.toComeVaries
                        ? t('event.about', { amount: money(-month.toCome) })
                        : money(-month.toCome)}
                    </Row>
                  )}
                </dl>
                <p className="text-muted-foreground pt-3 text-xs">{t('left.note')}</p>
              </Collapse>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground min-w-0">{label}</dt>
      <dd className="shrink-0 tabular-nums">{children}</dd>
    </div>
  );
}
