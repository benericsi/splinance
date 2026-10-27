import { describe, expect, it } from 'vitest';
import { compactNumber, formatMonthRange, shortMonth } from './format';

describe('report formatting', () => {
  it('names months short', () => {
    expect(shortMonth('2026-10')).toBe('Oct');
  });

  it('writes the year once within a year and twice across one', () => {
    expect(formatMonthRange('2026-05', '2026-10')).toBe('May – Oct 2026');
    expect(formatMonthRange('2025-11', '2026-04')).toBe('Nov 2025 – Apr 2026');
  });

  it('shortens axis numbers', () => {
    expect(compactNumber(120_000)).toBe('120K');
    expect(compactNumber(1_250_000)).toBe('1.3M');
    expect(compactNumber(0)).toBe('0');
  });
});
