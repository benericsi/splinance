import type { BudgetList, Calendar } from '@splinance/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { cn } from '@/lib/utils';
import { budgetLeft, type CalendarView, summarize } from '../view';

/**
 * The month in three numbers: what was spent, what tracked payments will still take, and
 * what is left of the budgets (the month's income for a household without budgets).
 */
export function CalendarSummary({
  calendar,
  budgets,
  view,
}: {
  calendar: Calendar;
  budgets: BudgetList;
  view: CalendarView;
}) {
  const { t } = useTranslation('calendar');
  const { currency } = calendar;
  const summary = summarize(calendar, view);
  const left = budgetLeft(budgets);
  const mine = view === 'mine';

  return (
    // On phones the columns size to their amounts, like the month totals of Transactions.
    <dl className="grid gap-2 max-sm:grid-cols-[repeat(3,auto)] sm:grid-cols-3 sm:gap-3">
      <Stat
        label={mine ? t('stats.youSpent') : t('stats.spent')}
        value={<MoneyFlow minor={summary.spent} currency={currency} />}
      />
      <Stat
        label={t('stats.toCome')}
        value={<MoneyFlow minor={summary.toCome} currency={currency} />}
      />
      {left === null ? (
        <Stat
          label={mine ? t('stats.yourIncome') : t('stats.income')}
          value={<MoneyFlow minor={summary.income} currency={currency} signed />}
          className={summary.income > 0 ? 'text-positive' : undefined}
        />
      ) : (
        <Stat
          label={left < 0 ? t('stats.overBudget') : t('stats.budgetLeft')}
          value={<MoneyFlow minor={Math.abs(left)} currency={currency} />}
          className={left < 0 ? 'text-negative' : undefined}
        />
      )}
    </dl>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-lg px-2 py-2.5 sm:px-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('truncate text-[13px]/5 font-semibold tabular-nums sm:text-lg', className)}>
        {value}
      </dd>
    </div>
  );
}
