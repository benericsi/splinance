import type { Currency } from '@splinance/shared';
import type { ReactNode } from 'react';
import { formatMoney, MONEY_PATTERN } from '../money';

/**
 * A static amount ("10 001 Ft"): `formatMoney` in a span marked `data-amount`, so it blurs
 * while amounts are hidden (`src/lib/hide-amounts.ts`). Amounts that change in place use
 * `MoneyFlow`, which carries the same mark.
 */
export function Amount({
  minor,
  currency,
  signed = false,
  className,
}: {
  minor: number;
  currency: Currency;
  signed?: boolean;
  className?: string | undefined;
}) {
  return (
    <span data-amount="" className={className}>
      {formatMoney(minor, currency, { signed })}
    </span>
  );
}

/**
 * A sentence that holds amounts ("Your part: 4490 Ft", "from 4490 Ft to 4990 Ft"), with
 * each amount marked like `Amount`, so only the numbers blur and the words stay readable.
 * For text built with `formatMoney` (translations, `describeNotification`); a plain
 * string without amounts comes back unchanged.
 */
export function MaskMoney({ children }: { children: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of children.matchAll(MONEY_PATTERN)) {
    if (match.index > last) parts.push(children.slice(last, match.index));
    parts.push(
      <span key={match.index} data-amount="">
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return children;
  if (last < children.length) parts.push(children.slice(last));
  return parts;
}
