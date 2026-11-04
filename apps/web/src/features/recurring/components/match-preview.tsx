import {
  type Currency,
  matchKey,
  type RecurringPreviewInput,
  recurringPatternSchema,
} from '@splinance/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleCheck, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatMoney, readAmount } from '@/features/transactions/money';
import { recurringQueries } from '../queries';
import { shortDate } from '../view';

/** The value once it has stopped changing for `ms` (typing). */
function useSettled(value: string, ms = 400): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return settled;
}

const payments = (count: number) => `${String(count)} past ${count === 1 ? 'payment' : 'payments'}`;

/**
 * Under the pattern field: which of the viewer's past payments the series would own, so the
 * recognition is visible before saving. Asked once typing settles.
 */
export function MatchPreview({
  id,
  householdId,
  currency,
  pattern,
  amount,
  amountVaries,
  scope,
  startsOn,
}: Omit<RecurringPreviewInput, 'amount'> & {
  id: string;
  householdId: string;
  currency: Currency;
  /** As typed. */
  amount: string;
}) {
  const minor = readAmount(amount, currency).minor;
  const typed: RecurringPreviewInput | null =
    recurringPatternSchema.safeParse(pattern).success && minor !== undefined
      ? { pattern: pattern.trim(), amount: minor, amountVaries, scope, startsOn }
      : null;
  // Settled as text: a new object every render would restart the timer forever.
  const input = JSON.parse(useSettled(JSON.stringify(typed))) as RecurringPreviewInput | null;
  const preview = useQuery({
    ...recurringQueries.preview(
      householdId,
      input ?? { pattern: '', amount: 1, amountVaries, scope, startsOn },
    ),
    enabled: input !== null,
    placeholderData: keepPreviousData,
  });

  if (input === null) return null;
  const latest = preview.data?.recent[0];

  return (
    <div
      id={id}
      aria-live="polite"
      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      {preview.data && preview.data.matches > 0 ? (
        <>
          <CircleCheck className="text-positive mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Matches {payments(preview.data.matches)}</p>
            {latest && (
              <p className="text-muted-foreground text-xs">
                Latest {shortDate(latest.occurredOn)}, {formatMoney(latest.amount, currency)}.
                Future imports are recognized too.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <Search className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-muted-foreground min-w-0">
            {preview.isPending
              ? 'Looking for past payments…'
              : `No past payments match yet. Imports containing "${matchKey(input.pattern)}" will.`}
          </p>
        </>
      )}
    </div>
  );
}
