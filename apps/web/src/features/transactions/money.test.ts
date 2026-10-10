import { describe, expect, it } from 'vitest';
import { addMonths, formatDayHeading, formatMonth } from './dates';
import {
  formatAmountInput,
  formatMoney,
  formatPercentInput,
  parseAmount,
  parsePercent,
} from './money';

// Intl uses no-break spaces as group separators; compare with plain spaces.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoney', () => {
  it('formats forints without decimals and euros with two', () => {
    expect(plain(formatMoney(10_001, 'HUF'))).toBe('10 001 Ft');
    expect(plain(formatMoney(123_456_789, 'EUR'))).toBe('1 234 567,89 €');
    // Hungarian style: no grouping below five digits.
    expect(plain(formatMoney(2500, 'HUF'))).toBe('2500 Ft');
  });

  it('signs when asked', () => {
    expect(plain(formatMoney(-10_001, 'HUF', { signed: true }))).toBe('-10 001 Ft');
    expect(plain(formatMoney(420_000, 'HUF', { signed: true }))).toBe('+420 000 Ft');
    expect(plain(formatMoney(0, 'HUF', { signed: true }))).toBe('0 Ft');
  });

  it('prefills inputs without the currency', () => {
    expect(plain(formatAmountInput(10_001, 'HUF'))).toBe('10 001');
    expect(formatAmountInput(1250, 'EUR')).toBe('12,50');
  });
});

describe('parseAmount', () => {
  it.each([
    ['10001', 10_001],
    ['10 001', 10_001],
    ['10\u00a0001', 10_001],
    ['10,001', 10_001],
    ['10.001', 10_001],
    ['1.000.000', 1_000_000],
  ])('reads %j as forints', (text, minor) => {
    expect(parseAmount(text, 'HUF')).toBe(minor);
  });

  it.each([
    ['12,50', 1250],
    ['12.5', 1250],
    ['1.234,56', 123_456],
    ['1,234.56', 123_456],
    ['12', 1200],
    [',5', 50],
  ])('reads %j as euros', (text, minor) => {
    expect(parseAmount(text, 'EUR')).toBe(minor);
  });

  it.each(['', 'abc', '0', '10.5', '12,345,6', '-5', '1e5', '99999999999999'])(
    'rejects %j as forints',
    (text) => {
      expect(parseAmount(text, 'HUF')).toBeUndefined();
    },
  );

  it('rejects too many euro decimals', () => {
    expect(parseAmount('1,234', 'EUR')).toBe(123_400);
    expect(parseAmount('1,2345', 'EUR')).toBeUndefined();
  });
});

describe('percentages', () => {
  it('reads and writes basis points', () => {
    expect(parsePercent('60')).toBe(6000);
    expect(parsePercent('33,33 %')).toBe(3333);
    expect(parsePercent('0')).toBeUndefined();
    expect(parsePercent('101')).toBeUndefined();
    expect(parsePercent('1.234')).toBeUndefined();
    expect(formatPercentInput(6000)).toBe('60');
    expect(formatPercentInput(3333)).toBe('33,33');
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 10, 12);

  it('labels days relative to today', () => {
    expect(formatDayHeading('2026-10-10', now)).toBe('Today, Sat 10 Oct');
    expect(formatDayHeading('2026-10-09', now)).toBe('Yesterday, Fri 9 Oct');
    expect(formatDayHeading('2026-10-01', now)).toBe('Thu 1 Oct');
    expect(formatDayHeading('2025-12-31', now)).toBe('Wed 31 Dec 2025');
  });

  it('steps months across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(formatMonth('2026-10')).toBe('October 2026');
  });
});
