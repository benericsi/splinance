import type { Calendar } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { ChevronRight, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from '@/components/collapse';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Amount, MaskMoney } from '@/features/transactions/components/amount';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatShortDate } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { useAuth } from '@/lib/auth-store';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { leftThisMonth } from '../left';
import { hideLeftNudge, isLeftNudgeHidden } from '../left-nudge';
import { DayBars } from './day-bars';

/**
 * The overview's hero: what is left of the viewer's income this month after what they
 * spent, the recurring payments still expected and what they set aside in savings, as one
 * number on a tinted surface, its parts as chips, the month's days as bars and (on request)
 * the sum behind it. Without any income to measure against it offers to track a salary instead (or, with
 * one tracked, to add the income itself); that offer can be hidden, per person and browser.
 */
export function LeftThisMonthCard({
  householdId,
  calendar,
  setAside = 0,
  tracksIncome,
}: {
  householdId: string;
  calendar: Calendar;
  /** The viewer's net savings entries this month (0 until they are known). */
  setAside?: number;
  /** The viewer follows a recurring income: the empty state stops offering to add one. */
  tracksIncome: boolean;
}) {
  const { t } = useTranslation('calendar');
  const [open, setOpen] = useState(false);
  const userId = useAuth().user?.id ?? '';
  const [hidden, setHidden] = useState(() => isLeftNudgeHidden(userId, householdId));
  const headingId = useId();
  const detailsId = useId();
  const month = leftThisMonth(calendar, setAside);
  const { currency } = calendar;
  const money = (minor: number) => formatMoney(minor, currency);

  if (!month) {
    if (hidden) return null;
    // With a salary tracked the offer would loop: say what is missing instead.
    const said = tracksIncome ? 'waiting' : 'nudge';
    return (
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">{t(`left.${said}.title`)}</h2>
              <p className="text-muted-foreground">{t(`left.${said}.text`)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('left.nudge.hide')}
              className="text-muted-foreground -mt-1 -mr-2 shrink-0"
              onClick={() => {
                hideLeftNudge(userId, householdId);
                setHidden(true);
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
          {tracksIncome ? (
            <Link
              to="/h/$householdId/transactions/new"
              params={{ householdId }}
              state={OPEN_MODAL_STATE}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('left.waiting.action')}
            </Link>
          ) : (
            <Link
              to="/h/$householdId/recurring/new"
              params={{ householdId }}
              search={{ kind: 'income' }}
              state={OPEN_MODAL_STATE}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('left.nudge.action')}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const over = month.left < 0;
  const chips = [
    { key: 'spent', amount: month.spent },
    { key: 'setAside', amount: month.setAside },
    { key: 'toCome', amount: month.toCome },
  ] as const;
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
    <Card
      role="region"
      aria-labelledby={headingId}
      className={cn(
        // The page's one accent surface; muted text needs a darker grey on the tint.
        '[--muted-foreground:var(--tint-muted-foreground)]',
        over ? 'bg-negative-tint ring-negative/15' : 'bg-positive-tint ring-positive/15',
      )}
    >
      <CardContent>
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
        <div className="mt-1 grid gap-x-10 gap-y-4 md:grid-cols-2 md:items-end">
          <div className="min-w-0">
            <p
              className={cn(
                'font-heading text-4xl font-semibold tracking-tight tabular-nums md:text-5xl',
                over && 'text-negative',
              )}
            >
              <MoneyFlow minor={Math.abs(month.left)} currency={currency} />
            </p>
            {note && (
              <p className="text-muted-foreground mt-1">
                <MaskMoney>{note}</MaskMoney>
              </p>
            )}
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {chips
                .filter((chip) => chip.key === 'spent' || chip.amount > 0)
                .map((chip) => (
                  <li
                    key={chip.key}
                    className="bg-background/70 flex items-baseline gap-1.5 rounded-full px-3 py-1"
                  >
                    <span className="text-muted-foreground">{t(`left.chips.${chip.key}`)}</span>
                    <Amount minor={chip.amount} currency={currency} className="tabular-nums" />
                  </li>
                ))}
            </ul>
          </div>
          <DayBars calendar={calendar} over={over} />
        </div>

        <div className="border-foreground/10 mt-4 border-t pt-3">
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
                    <Amount
                      minor={month.received}
                      currency={currency}
                      signed={month.received > 0}
                    />
                  </span>
                </Row>
                {month.expectedIncome > 0 && (
                  <Row label={t('left.rows.expectedIncome')}>
                    <span className="text-positive">
                      <Amount minor={month.expectedIncome} currency={currency} signed />
                    </span>
                  </Row>
                )}
                <Row label={t('left.rows.spent')}>
                  <Amount minor={-month.spent} currency={currency} />
                </Row>
                {month.setAside !== 0 && (
                  <Row label={t(month.setAside > 0 ? 'left.rows.setAside' : 'left.rows.takenOut')}>
                    <Amount
                      minor={-month.setAside}
                      currency={currency}
                      signed={month.setAside < 0}
                    />
                  </Row>
                )}
                {month.toCome > 0 && (
                  <Row label={t('left.rows.toCome', { count: month.toComeCount })}>
                    <MaskMoney>
                      {month.toComeVaries
                        ? t('event.about', { amount: money(-month.toCome) })
                        : money(-month.toCome)}
                    </MaskMoney>
                  </Row>
                )}
              </dl>
              <p className="text-muted-foreground pt-3 text-xs">{t('left.note')}</p>
            </Collapse>
          </div>
        </div>
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
