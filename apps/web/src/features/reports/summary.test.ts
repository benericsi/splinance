import { monthsBetween, type Report } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { percentChange, summarize } from './summary';
import { reportRange } from './window';

const groceries = '01a12509-0f61-75bc-b406-130108780601';
const housing = '01a12509-0f61-75bc-b406-130108780602';

/** A report from 2025-01 to 2026-12 with the given months filled in. */
function reportWith(
  months: Record<string, [spent: number, income: number, yourSpent?: number, yourIncome?: number]>,
  categories: Report['categories'] = [],
): Report {
  return {
    from: '2025-01',
    to: '2026-12',
    currency: 'HUF',
    months: monthsBetween('2025-01', '2026-12').map((month) => {
      const [expenses = 0, income = 0, yourExpenses = expenses, yourIncome = income] =
        months[month] ?? [];
      return { month, expenses, income, yourExpenses, yourIncome };
    }),
    categories,
  };
}

describe('summarize', () => {
  it('compares the selected month with the one before', () => {
    const report = reportWith(
      { '2026-09': [80_000, 100_000], '2026-10': [90_000, 120_000, 45_000, 60_000] },
      [
        { month: '2026-10', categoryId: housing, expenses: 60_000, yourExpenses: 30_000 },
        { month: '2026-10', categoryId: groceries, expenses: 30_000, yourExpenses: 15_000 },
        { month: '2026-09', categoryId: groceries, expenses: 80_000, yourExpenses: 80_000 },
      ],
    );
    const range = reportRange({ to: '2026-10' }, '2026-10');
    const summary = summarize(report, range, 'household', '2026-10');

    expect(summary).toMatchObject({
      spent: 90_000,
      income: 120_000,
      left: 30_000,
      previous: { spent: 80_000, income: 100_000, left: 20_000 },
      compareLabel: 'vs Sept',
      savedPercent: 25,
      top: { categoryId: housing, amount: 60_000, percent: 67 },
    });
    expect(summary.trend).toEqual({
      spent: [0, 0, 0, 0, 80_000, 90_000],
      income: [0, 0, 0, 0, 100_000, 120_000],
      left: [0, 0, 0, 0, 20_000, 30_000],
      selected: 5,
    });

    const mine = summarize(report, range, 'mine', '2026-10');
    expect(mine).toMatchObject({ spent: 45_000, income: 60_000, left: 15_000 });
    expect(mine.top).toEqual({ categoryId: housing, amount: 30_000, percent: 67 });
  });

  it('marks the selected month inside the six', () => {
    const range = reportRange({ to: '2026-10', month: '2026-07' }, '2026-10');
    const summary = summarize(reportWith({ '2026-07': [1000, 0] }), range, 'household', '2026-10');
    expect(summary.trend.selected).toBe(2);
    expect(summary.compareLabel).toBe('vs Jun');
    expect(summary.previous).toBeNull();
    expect(summary.savedPercent).toBeNull();
  });

  it('compares this year so far with the same months of last year', () => {
    const report = reportWith({
      '2025-01': [10_000, 0],
      '2025-10': [20_000, 0],
      '2025-11': [999_000, 0],
      '2026-02': [40_000, 50_000],
    });
    const summary = summarize(
      report,
      reportRange({ period: 'year' }, '2026-10'),
      'household',
      '2026-10',
    );
    expect(summary).toMatchObject({
      spent: 40_000,
      income: 50_000,
      previous: { spent: 30_000, income: 0, left: -30_000 },
      compareLabel: 'vs Jan–Oct 2025',
    });
    expect(summary.trend.spent).toHaveLength(10);
    expect(summary.trend.selected).toBe(9);
  });

  it('compares a past year with the whole year before', () => {
    const report = reportWith({ '2025-11': [5000, 0] });
    const range = reportRange({ period: 'year', year: '2025' }, '2026-10');
    const summary = summarize(report, range, 'household', '2026-10');
    expect(summary.compareLabel).toBe('vs 2024');
    expect(summary.spent).toBe(5000);
    expect(summary.trend.spent).toHaveLength(12);
    expect(summary.top).toBeNull();
  });
});

describe('percentChange', () => {
  it('is relative to the size of the earlier value', () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(90, 100)).toBe(-10);
    expect(percentChange(-50, -100)).toBe(50);
    expect(percentChange(100, 0)).toBeNull();
  });
});
