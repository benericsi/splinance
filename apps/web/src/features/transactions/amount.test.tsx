import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Amount, MaskMoney } from './components/amount';
import { formatMoney, MONEY_PATTERN } from './money';

const values = [0, 5, 2500, 10_001, -123_456_750, 1_000_000_000_000];

describe('MONEY_PATTERN', () => {
  it('matches all of every amount formatMoney writes', () => {
    for (const currency of ['HUF', 'EUR'] as const) {
      for (const minor of values) {
        for (const signed of [false, true]) {
          const text = formatMoney(minor, currency, { signed });
          expect([...text.matchAll(MONEY_PATTERN)].map((match) => match[0])).toEqual([text]);
        }
      }
    }
  });

  it('leaves numbers that are not amounts alone', () => {
    expect('18 days, 60 / 40 %, 2026'.match(MONEY_PATTERN)).toBeNull();
  });
});

describe('MaskMoney', () => {
  it('marks only the amounts in a sentence', () => {
    const from = formatMoney(449_000, 'HUF');
    const to = formatMoney(-1250, 'EUR', { signed: true });
    const { container } = render(<MaskMoney>{`From ${from} to ${to} on 12 Nov`}</MaskMoney>);

    expect([...container.querySelectorAll('[data-amount]')].map((el) => el.textContent)).toEqual([
      from,
      to,
    ]);
    expect(container.textContent).toBe(`From ${from} to ${to} on 12 Nov`);
  });

  it('gives back a sentence without amounts as it is', () => {
    const { container } = render(<MaskMoney>Paid</MaskMoney>);
    expect(container.innerHTML).toBe('Paid');
  });
});

describe('Amount', () => {
  it('is formatMoney in a marked span', () => {
    const { container } = render(<Amount minor={-4490} currency="HUF" signed />);
    const span = container.querySelector('[data-amount]');
    expect(span?.textContent).toBe(formatMoney(-4490, 'HUF', { signed: true }));
  });
});
