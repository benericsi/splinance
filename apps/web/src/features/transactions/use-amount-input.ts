import type { Currency } from '@splinance/shared';
import { type ChangeEvent, useLayoutEffect, useRef } from 'react';
import { caretAfterFormat, formatAmountTyping } from './money';

/**
 * Props for an amount `<input>` that groups digits while typing ("100 000 000"). React
 * moves the caret to the end whenever a controlled value changes, so the caret position
 * is computed before the update and restored right after the render.
 */
export function useAmountInput({
  value,
  onChange,
  currency,
}: {
  value: string;
  onChange: (value: string) => void;
  currency: Currency;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = ref.current;
    const caret = pendingCaret.current;
    if (input && caret !== null && document.activeElement === input) {
      input.setSelectionRange(caret, caret);
    }
    pendingCaret.current = null;
  });

  return {
    ref,
    value,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const formatted = formatAmountTyping(raw, currency);
      pendingCaret.current = caretAfterFormat(
        raw,
        event.target.selectionStart ?? raw.length,
        formatted,
        currency,
      );
      onChange(formatted);
    },
  };
}
