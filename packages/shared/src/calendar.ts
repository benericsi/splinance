import { z } from 'zod';
import { currencySchema } from './households';
import { recurringScopeSchema } from './recurring/schemas';
import { addMonths } from './reports';
import { monthSchema, personSchema, transactionKindSchema } from './transactions';

/** How far ahead of the current month expected payments are worked out. */
export const CALENDAR_MONTHS_AHEAD = 12;

/** The last month the calendar shows expected payments for. */
export function lastCalendarMonth(currentMonth: string): string {
  return addMonths(currentMonth, CALENDAR_MONTHS_AHEAD);
}

/** The days of a month (`YYYY-MM`) as `YYYY-MM-DD`, in order. */
export function daysOfMonth(month: string): string[] {
  const [year = 1970, index = 1] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return Array.from({ length: count }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`);
}

export const calendarQuerySchema = z.object({
  month: monthSchema,
  /**
   * Only this category: day totals count its transactions, events are the recurring
   * series filed under it (settlements have no category, so none).
   */
  categoryId: z.uuid().optional(),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

const dateSchema = z.iso.date();
const amount = z.number().int().nonnegative();

/**
 * One day's totals, as the viewer sees them (the same rule as a report month): household
 * totals count shared transactions and the viewer's own private ones, `your` totals the
 * viewer's part of them.
 */
export const calendarDaySchema = z.object({
  date: dateSchema,
  expenses: amount,
  income: amount,
  yourExpenses: amount,
  yourIncome: amount,
  /** Transactions the viewer can see on this day. */
  count: amount,
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

const recurringEventFields = {
  date: dateSchema,
  seriesId: z.uuid(),
  name: z.string(),
  scope: recurringScopeSchema,
  /** Money going out, or (an income series) coming in. */
  kind: transactionKindSchema,
  categoryId: z.uuid().nullable(),
  amount: z.number().int().positive(),
};

/** A transaction found to be a tracked series' payment. */
export const calendarRecurringPaidSchema = z.object({
  type: z.literal('recurringPaid'),
  ...recurringEventFields,
  transactionId: z.uuid(),
  /** The viewer's part: the whole of a private payment, their share of a shared one. */
  yourAmount: amount,
});

/**
 * A payment a tracked series should bring: not a transaction yet. The amount is the
 * latest payment's (an estimate when `amountVaries`). A date before today means it is due
 * and still within the series' grace window.
 */
export const calendarRecurringExpectedSchema = z.object({
  type: z.literal('recurringExpected'),
  ...recurringEventFields,
  amountVaries: z.boolean(),
  /** The viewer's part going by the latest payment; null when nothing tells (no payment yet). */
  yourAmount: amount.nullable(),
});

/** A settle-up payment between two people; every member sees these. */
export const calendarSettlementSchema = z.object({
  type: z.literal('settlement'),
  date: dateSchema,
  settlementId: z.uuid(),
  from: personSchema,
  to: personSchema,
  amount: z.number().int().positive(),
});

export const calendarEventSchema = z.discriminatedUnion('type', [
  calendarRecurringPaidSchema,
  calendarRecurringExpectedSchema,
  calendarSettlementSchema,
]);
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarEventType = CalendarEvent['type'];

export const calendarSchema = z.object({
  month: monthSchema,
  /** Today on the server (Budapest): what "expected" is counted from. */
  today: dateSchema,
  currency: currencySchema,
  /** Every day of the month, in order, zero when nothing happened. */
  days: z.array(calendarDaySchema),
  /** By date, then paid, expected, settlements; largest first within a kind. */
  events: z.array(calendarEventSchema),
});
export type Calendar = z.infer<typeof calendarSchema>;

export const calendarResponseSchema = z.object({ calendar: calendarSchema });
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
