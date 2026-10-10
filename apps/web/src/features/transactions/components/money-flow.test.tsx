import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMoney, rollTrend } from '../money';
import { MoneyFlow } from './money-flow';

describe('MoneyFlow', () => {
  it('formats exactly like the static amounts', () => {
    // The animated digits (here the test stand-in) and the screen reader copy agree.
    const { container } = render(<MoneyFlow minor={-10_001} currency="HUF" signed />);
    const signed = formatMoney(-10_001, 'HUF', { signed: true });
    expect(container.textContent).toBe(signed + signed);
    expect(container.querySelector('.sr-only')?.textContent).toBe(signed);

    const { container: euros } = render(<MoneyFlow minor={123_456} currency="EUR" />);
    expect(euros.querySelector('.sr-only')?.textContent).toBe(formatMoney(123_456, 'EUR'));
  });

  it('rolls new digits down when the value grows and up when it shrinks', () => {
    // NumberFlow: a positive trend rolls digits up, a negative one down.
    expect(rollTrend(100, 250)).toBe(-1);
    expect(rollTrend(250, 100)).toBe(1);
    expect(rollTrend(100, 100)).toBe(0);
  });
});
