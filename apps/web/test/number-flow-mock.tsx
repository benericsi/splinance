import type { NumberFlowProps } from '@number-flow/react';

/**
 * Stand-in for NumberFlow in jsdom: its custom element only registers in a real browser
 * (and jsdom has no Web Animations), so tests get the final, formatted text instead.
 */
export default function NumberFlowMock({
  value,
  locales,
  format,
  className,
  'aria-hidden': ariaHidden,
}: NumberFlowProps) {
  return (
    <span className={className} aria-hidden={ariaHidden}>
      {new Intl.NumberFormat(locales, format).format(value)}
    </span>
  );
}
