import type { TransactionSummary } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { addMonths, currentMonth, formatMonth } from '../dates';
import { formatMoney } from '../money';

/** Previous / next month links (the month lives in the URL) and the month's totals. */
export function MonthHeader({ month, summary }: { month: string; summary: TransactionSummary }) {
  const isCurrent = month === currentMonth();
  const stepLink = (delta: number, label: string, Icon: typeof ChevronLeft) => (
    <Link
      from="/h/$householdId/transactions"
      search={(prev) => ({ ...prev, month: addMonths(month, delta) })}
      aria-label={label}
      className={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <Icon aria-hidden />
    </Link>
  );

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center gap-1">
        {stepLink(-1, 'Previous month', ChevronLeft)}
        <h2 className="font-heading min-w-36 text-center text-lg font-semibold">
          {formatMonth(month)}
        </h2>
        {stepLink(1, 'Next month', ChevronRight)}
        {!isCurrent && (
          <Link
            from="/h/$householdId/transactions"
            search={(prev) => ({ ...prev, month: undefined })}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'ml-2' })}
          >
            This month
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Spent" value={formatMoney(summary.expenses, summary.currency)} />
        <Stat label="Your share" value={formatMoney(summary.yourExpenses, summary.currency)} />
        <Stat
          label="Income"
          value={formatMoney(summary.income, summary.currency, { signed: true })}
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
  value: string;
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
