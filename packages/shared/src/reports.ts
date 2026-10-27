import { z } from 'zod';
import { currencySchema } from './households';
import { monthSchema } from './transactions';

/** The longest range one report covers. */
export const REPORT_MAX_MONTHS = 24;

/** `addMonths('2026-01', -1)` is `'2025-12'`. Plain arithmetic, no time zones involved. */
export function addMonths(month: string, delta: number): string {
  const [year = 1970, index = 1] = month.split('-').map(Number);
  const total = year * 12 + (index - 1) + delta;
  const nextYear = Math.floor(total / 12);
  return `${String(nextYear)}-${String(total - nextYear * 12 + 1).padStart(2, '0')}`;
}

/** Every month from `from` to `to`, both included; empty if `to` comes first. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) months.push(month);
  return months;
}

export const reportQuerySchema = z
  .object({ from: monthSchema, to: monthSchema })
  .refine(({ from, to }) => from <= to, { message: '`from` must not be after `to`', path: ['to'] })
  .refine(({ from, to }) => monthsBetween(from, to).length <= REPORT_MAX_MONTHS, {
    message: `At most ${String(REPORT_MAX_MONTHS)} months`,
    path: ['from'],
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;

/**
 * One month's totals, as the viewer sees them. Household totals count shared transactions
 * and the viewer's own private ones (like the month summary); `your` totals count the
 * viewer's part: their share of shared ones, the whole of their private ones.
 */
export const reportMonthSchema = z.object({
  month: monthSchema,
  expenses: z.number().int().nonnegative(),
  income: z.number().int().nonnegative(),
  yourExpenses: z.number().int().nonnegative(),
  yourIncome: z.number().int().nonnegative(),
});

export type ReportMonth = z.infer<typeof reportMonthSchema>;

/** Expenses of one category (null: none) in one month; only rows with spending. */
export const reportCategorySchema = z.object({
  month: monthSchema,
  categoryId: z.uuid().nullable(),
  expenses: z.number().int().nonnegative(),
  yourExpenses: z.number().int().nonnegative(),
});

export type ReportCategory = z.infer<typeof reportCategorySchema>;

export const reportSchema = z.object({
  from: monthSchema,
  to: monthSchema,
  currency: currencySchema,
  /** Every month of the range, in order, zero when nothing happened. */
  months: z.array(reportMonthSchema),
  categories: z.array(reportCategorySchema),
});

export type Report = z.infer<typeof reportSchema>;

export const reportResponseSchema = z.object({ report: reportSchema });
export type ReportResponse = z.infer<typeof reportResponseSchema>;
