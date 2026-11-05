import type { TransactionSummary } from '@splinance/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MonthNav } from '@/components/month-nav';
import { cn } from '@/lib/utils';
import { MoneyFlow } from './money-flow';

/** The month switcher (the month lives in the URL) and the month's totals. */
export function MonthHeader({ month, summary }: { month: string; summary: TransactionSummary }) {
  const { t } = useTranslation('transactions');
  return (
    <div className="mb-6 space-y-4">
      <MonthNav month={month} page="/h/$householdId/transactions" />
      {/* On phones the columns size to their amounts: "+1 690 000 Ft" needs more than a third. */}
      <dl className="grid gap-2 max-sm:grid-cols-[repeat(3,auto)] sm:grid-cols-3 sm:gap-3">
        <Stat
          label={t('stats.spent')}
          value={<MoneyFlow minor={summary.expenses} currency={summary.currency} />}
        />
        <Stat
          label={t('stats.yourShare')}
          value={<MoneyFlow minor={summary.yourExpenses} currency={summary.currency} />}
        />
        <Stat
          label={t('stats.income')}
          value={<MoneyFlow minor={summary.income} currency={summary.currency} signed />}
          className={summary.income > 0 ? 'text-positive' : undefined}
        />
      </dl>
    </div>
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
