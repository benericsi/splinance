import type { Currency } from '@splinance/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { currencySymbol } from '../money';
import { useAmountInput } from '../use-amount-input';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  currency: Currency;
}

/** The large amount at the top of the transaction dialog, grouped while typing. */
export function HeroAmountInput({
  id,
  value,
  onChange,
  onBlur,
  currency,
  error,
  autoFocus,
}: AmountInputProps & {
  id: string;
  onBlur: () => void;
  error: string | undefined;
  autoFocus: boolean;
}) {
  const props = useAmountInput({ value, onChange, currency });

  return (
    <div className="flex min-w-0 items-baseline justify-center gap-2">
      <input
        {...props}
        id={id}
        placeholder="0"
        autoFocus={autoFocus}
        onBlur={onBlur}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'font-heading placeholder:text-muted-foreground/60 focus-visible:border-ring aria-invalid:border-destructive max-w-full min-w-[2ch] border-b-2 border-transparent bg-transparent text-center font-semibold tabular-nums outline-none',
          // Long numbers get smaller instead of overflowing the row.
          value.length > 13 ? 'text-2xl' : value.length > 9 ? 'text-3xl' : 'text-4xl',
        )}
        style={{ fieldSizing: 'content' }}
      />
      <span className="text-muted-foreground text-xl">{currencySymbol(currency)}</span>
    </div>
  );
}

/** One person's fixed amount in the split editor. */
export function ShareAmountInput({
  label,
  value,
  onChange,
  currency,
}: AmountInputProps & { label: string }) {
  const props = useAmountInput({ value, onChange, currency });

  return (
    <div className="relative w-28 shrink-0">
      <Input {...props} aria-label={label} className="h-8 pr-7 text-right tabular-nums" />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
        {currencySymbol(currency)}
      </span>
    </div>
  );
}
