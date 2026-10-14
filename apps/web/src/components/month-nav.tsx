import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { addMonths, currentMonth, formatMonth } from '@/features/transactions/dates';

/** Pages whose month lives in `?month=` (absent means the current one). */
type MonthPage = '/h/$householdId/transactions' | '/h/$householdId/budgets';

/** Previous / next month links, the month as a heading, and "This month" when away from it. */
export function MonthNav({ month, page }: { month: string; page: MonthPage }) {
  const stepLink = (delta: number, label: string, Icon: typeof ChevronLeft) => (
    <Link
      from={page}
      search={(prev) => ({ ...prev, month: addMonths(month, delta) })}
      aria-label={label}
      className={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <Icon aria-hidden />
    </Link>
  );

  return (
    <div className="flex items-center gap-1">
      {stepLink(-1, 'Previous month', ChevronLeft)}
      <h2 className="font-heading min-w-36 text-center text-lg font-semibold">
        {formatMonth(month)}
      </h2>
      {stepLink(1, 'Next month', ChevronRight)}
      {month !== currentMonth() && (
        <Link
          from={page}
          search={(prev) => ({ ...prev, month: undefined })}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'ml-2' })}
        >
          This month
        </Link>
      )}
    </div>
  );
}
