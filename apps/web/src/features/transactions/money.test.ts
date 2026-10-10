import { describe, expect, it } from 'vitest';
import { addMonths, formatDayHeading, formatMonth } from './dates';
import {
  formatAmountInput,
  formatMoney,
  formatPercentInput,
  parseAmount,
  parsePercent,
  readAmount,
  amountProblemMessage,
  caretAfterFormat,
  formatAmountTyping,
  sanitizePercentInput,
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

  it('says why an amount cannot be used', () => {
    expect(readAmount('  ', 'HUF')).toEqual({ problem: 'empty' });
    expect(readAmount('0', 'HUF')).toEqual({ problem: 'zero' });
    expect(readAmount('12x', 'HUF')).toEqual({ problem: 'invalid' });
    expect(readAmount('5 000 000 000 000', 'HUF')).toEqual({ problem: 'too-large' });
    expect(readAmount('1 000 000 000 000', 'HUF')).toEqual({ minor: 1_000_000_000_000 });
    expect(plain(amountProblemMessage('too-large', 'HUF'))).toBe(
      'Amount can be at most 1 000 000 000 000 Ft',
    );
  });

  it('rejects too many euro decimals', () => {
    expect(parseAmount('1,234', 'EUR')).toBe(123_400);
    expect(parseAmount('1,2345', 'EUR')).toBeUndefined();
  });
});

describe('formatting while typing', () => {
  it('groups forints like the rest of the app and drops anything else', () => {
    expect(plain(formatAmountTyping('100000000', 'HUF'))).toBe('100 000 000');
    expect(plain(formatAmountTyping('2500', 'HUF'))).toBe('2500');
    expect(plain(formatAmountTyping('12345', 'HUF'))).toBe('12 345');
    // 17 digits typed, capped at 13: exactly the largest amount the API accepts.
    expect(plain(formatAmountTyping('10000000000asdasdasld,000000', 'HUF'))).toBe(
      '1 000 000 000 000',
    );
    expect(formatAmountTyping('007', 'HUF')).toBe('7');
    expect(formatAmountTyping('Ft', 'HUF')).toBe('');
    expect(formatAmountTyping('9'.repeat(20), 'HUF').replace(/\D/g, '')).toHaveLength(13);
  });

  it('keeps a decimal comma for euros', () => {
    expect(plain(formatAmountTyping('12345.6', 'EUR'))).toBe('12 345,6');
    expect(formatAmountTyping('12,', 'EUR')).toBe('12,');
    expect(formatAmountTyping(',5', 'EUR')).toBe('0,5');
    expect(formatAmountTyping('1,999', 'EUR')).toBe('1,99');
    expect(plain(formatAmountTyping('1.234,56', 'EUR'))).toBe('1234,56');
  });

  it('keeps the caret behind the same digit', () => {
    // Typing the 6th digit at the end of "12 345" -> "123 456": caret at the end.
    const raw = '12\u00a03456';
    const formatted = formatAmountTyping(raw, 'HUF');
    expect(caretAfterFormat(raw, raw.length, formatted, 'HUF')).toBe(formatted.length);
    // A digit inserted after "1" in "1 000 000": caret right behind it.
    const inserted = '19\u00a0000\u00a0000';
    const regrouped = formatAmountTyping(inserted, 'HUF');
    expect(plain(regrouped)).toBe('19 000 000');
    expect(caretAfterFormat(inserted, 2, regrouped, 'HUF')).toBe(2);
    expect(caretAfterFormat('', 0, '', 'HUF')).toBe(0);
  });

  it('cleans percentages', () => {
    expect(sanitizePercentInput('33,3x%')).toBe('33,3%');
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
