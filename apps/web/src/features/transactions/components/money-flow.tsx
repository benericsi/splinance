import NumberFlow from '@number-flow/react';
import type { Currency } from '@splinance/shared';
import { formatMoney, MONEY_LOCALE, moneyFormatOptions, rollTrend, toMajor } from '../money';

/**
 * An amount that rolls its digits into place when it changes (month totals, day totals,
 * later balances). Same formatting as `formatMoney`; the first render is static, so a page
 * load does not animate. The OS "reduce motion" setting turns the rolling off.
 */
export function MoneyFlow({
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
    <span className={className}>
      {/* The rolling digits live in a shadow root; assistive tech, find-in-page and tests
          read the plain copy instead, so nobody depends on how the element exposes itself. */}
      <NumberFlow
        aria-hidden
        value={toMajor(minor, currency)}
        locales={MONEY_LOCALE}
        format={moneyFormatOptions(currency, { signed })}
        trend={rollTrend}
      />
      <span className="sr-only">{formatMoney(minor, currency, { signed })}</span>
    </span>
  );
}
