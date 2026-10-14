import type { TransactionSummary } from '@splinance/shared';
import type { ReactNode } from 'react';
import { MonthNav } from '@/components/month-nav';
import { cn } from '@/lib/utils';
import { MoneyFlow } from './money-flow';

/** The month switcher (the month lives in the URL) and the month's totals. */
export function MonthHeader({ month, summary }: { month: string; summary: TransactionSummary }) {
  return (
    <div className="mb-6 space-y-4">
      <MonthNav month={month} page="/h/$householdId/transactions" />
      <dl className="grid grid-cols-3 gap-3">
        <Stat
          label="Spent"
          value={<MoneyFlow minor={summary.expenses} currency={summary.currency} />}
        />
        <Stat
          label="Your share"
          value={<MoneyFlow minor={summary.yourExpenses} currency={summary.currency} />}
        />
        <Stat
          label="Income"
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
    <div className="bg-muted/50 min-w-0 rounded-lg px-3 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('truncate text-base font-semibold tabular-nums sm:text-lg', className)}>
        {value}
      </dd>
    </div>
  );
}
