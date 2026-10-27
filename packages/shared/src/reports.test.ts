import { describe, expect, it } from 'vitest';
import { addMonths, monthsBetween, REPORT_MAX_MONTHS, reportQuerySchema } from './reports';

describe('addMonths', () => {
  it.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', -11, '2025-11'],
    ['2026-10', 0, '2026-10'],
    ['2026-03', 24, '2028-03'],
  ])('%s %i is %s', (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected);
  });
});

describe('monthsBetween', () => {
  it('includes both ends and crosses years', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('is empty when the range is backwards', () => {
    expect(monthsBetween('2026-02', '2026-01')).toEqual([]);
  });
});

describe('reportQuerySchema', () => {
  it('accepts up to the maximum number of months', () => {
    const from = '2025-01';
    const to = addMonths(from, REPORT_MAX_MONTHS - 1);
    expect(reportQuerySchema.safeParse({ from, to }).success).toBe(true);
    expect(reportQuerySchema.safeParse({ from, to: addMonths(to, 1) }).success).toBe(false);
  });

  it('refuses a backwards range and malformed months', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-05', to: '2026-04' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2026-5', to: '2026-06' }).success).toBe(false);
  });
});
