import { addMonths, monthsBetween, type Report } from '@splinance/shared';
import type { ReportView } from './components/trend-chart';
import { shortMonth } from './format';
import type { ReportRange } from './window';

export interface ReportSummary {
  spent: number;
  income: number;
  left: number;
  /** The same figures one period earlier; null when that period had nothing at all. */
  previous: { spent: number; income: number; left: number } | null;
  /** "vs Sept", "vs Jan–Oct 2025", "vs 2025". */
  compareLabel: string;
  /** Share of income left over, in whole percent; null without income. */
  savedPercent: number | null;
  top: { categoryId: string | null; amount: number; percent: number } | null;
  /**
   * Month by month for the sparklines: the six months of the chart, or the year so far.
   * `selected` is the index of the month the cards show (the last one for a year).
   */
  trend: { spent: number[]; income: number[]; left: number[]; selected: number };
}

type Totals = Pick<ReportSummary, 'spent' | 'income' | 'left'>;

/**
 * The cards above the charts: the selected month (or the year, so far if it is this one)
 * against the one before (or the same months of last year). `report` must reach back far
 * enough: one month before the window, or the whole previous year.
 */
export function summarize(
  report: Report,
  range: ReportRange,
  view: ReportView,
  now: string,
): ReportSummary {
  const mine = view === 'mine';
  const byMonth = new Map(report.months.map((m) => [m.month, m]));
  const totals = (months: string[]): Totals => {
    let spent = 0;
    let income = 0;
    for (const month of months) {
      const m = byMonth.get(month);
      if (!m) continue;
      spent += mine ? m.yourExpenses : m.expenses;
      income += mine ? m.yourIncome : m.income;
    }
    return { spent, income, left: income - spent };
  };

  let current: string[];
  let previous: string[];
  let compareLabel: string;
  if (range.period === 'month') {
    current = [range.month];
    previous = [addMonths(range.month, -1)];
    compareLabel = `vs ${shortMonth(previous[0] ?? '')}`;
  } else {
    // This year: so far, against the same months of last year.
    const last = range.year === now.slice(0, 4) ? now : `${range.year}-12`;
    current = monthsBetween(`${range.year}-01`, last);
    previous = current.map((month) => addMonths(month, -12));
    const lastYear = String(Number(range.year) - 1);
    compareLabel = last.endsWith('-12')
      ? `vs ${lastYear}`
      : `vs Jan–${shortMonth(last)} ${lastYear}`;
  }

  const shown = totals(current);
  const before = totals(previous);
  const hadBefore = before.spent !== 0 || before.income !== 0;

  const inPeriod = new Set(current);
  const perCategory = new Map<string | null, number>();
  for (const row of report.categories) {
    if (!inPeriod.has(row.month)) continue;
    const amount = mine ? row.yourExpenses : row.expenses;
    perCategory.set(row.categoryId, (perCategory.get(row.categoryId) ?? 0) + amount);
  }
  let top: ReportSummary['top'] = null;
  for (const [categoryId, amount] of perCategory) {
    if (amount > 0 && (!top || amount > top.amount)) top = { categoryId, amount, percent: 0 };
  }
  if (top) top.percent = Math.round((top.amount / shown.spent) * 100);

  const trendMonths = range.period === 'month' ? monthsBetween(range.from, range.to) : current;
  const series = trendMonths.map((month) => totals([month]));

  return {
    ...shown,
    previous: hadBefore ? before : null,
    compareLabel,
    savedPercent: shown.income > 0 ? Math.round((shown.left / shown.income) * 100) : null,
    top,
    trend: {
      spent: series.map((s) => s.spent),
      income: series.map((s) => s.income),
      left: series.map((s) => s.left),
      selected: range.period === 'month' ? trendMonths.indexOf(range.month) : series.length - 1,
    },
  };
}

/** Change in whole percent against `before` (its size for a negative one); null from zero. */
export function percentChange(value: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((value - before) / Math.abs(before)) * 100);
}
