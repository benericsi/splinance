import type { BudgetList, Calendar, CalendarDay, CalendarEvent } from '@splinance/shared';
import { fromIsoDate } from '@/features/transactions/dates';

/** The whole household's spending or the viewer's part of it (the same switch as Reports). */
export type CalendarView = 'household' | 'mine';

/** Empty cells before the 1st: weeks start on Monday in both languages. */
export function leadingBlanks(month: string): number {
  return (fromIsoDate(`${month}-01`).getDay() + 6) % 7;
}

export const daySpent = (day: CalendarDay, view: CalendarView) =>
  view === 'mine' ? day.yourExpenses : day.expenses;

/**
 * What an event is worth in a view. A settlement is the same for everyone. For "your
 * share", an expected payment whose split nothing tells yet counts in full: better to
 * expect too much than too little.
 */
export function eventAmount(event: CalendarEvent, view: CalendarView): number {
  if (event.type === 'settlement' || view === 'household') return event.amount;
  return event.yourAmount ?? event.amount;
}

/** How dark a day is, 0 (nothing spent) to `SPEND_LEVELS`. */
export const SPEND_LEVELS = 4;

/**
 * A day's spending against the month's busiest day. The square root keeps ordinary days
 * apart when one day (the rent) dwarfs the rest.
 */
export function spendLevel(spent: number, max: number): number {
  if (spent <= 0 || max <= 0) return 0;
  return Math.min(SPEND_LEVELS, Math.max(1, Math.ceil(SPEND_LEVELS * Math.sqrt(spent / max))));
}

export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }
  return byDate;
}

/** Days of the month with spending. */
export const spendingDays = (calendar: Calendar, view: CalendarView) =>
  calendar.days.filter((day) => daySpent(day, view) > 0).length;

/** What was spent from the 1st through a day of the month. */
export function spentThrough(calendar: Calendar, view: CalendarView, dayOfMonth: number): number {
  return calendar.days
    .filter((day) => Number(day.date.slice(8)) <= dayOfMonth)
    .reduce((sum, day) => sum + daySpent(day, view), 0);
}

/**
 * How many days of a month have begun by `today`: its day number in the current month,
 * 0 in a month still ahead, more than any month has in a past one (all of it).
 */
export function daysElapsed(month: string, today: string): number {
  const current = today.slice(0, 7);
  if (month === current) return Number(today.slice(8));
  return month < current ? 31 : 0;
}

/**
 * The relative change from `before` to `now` (0.04 is 4% more); `'new'` when there was
 * nothing before, null when there is nothing in either.
 */
export function changeAgainst(now: number, before: number): number | 'new' | null {
  if (before > 0) return (now - before) / before;
  return now > 0 ? 'new' : null;
}

export interface CalendarSummary {
  spent: number;
  income: number;
  /** Expected payments of the month that have not shown up yet (never expected income). */
  toCome: number;
}

export function summarize(calendar: Calendar, view: CalendarView): CalendarSummary {
  let spent = 0;
  let income = 0;
  for (const day of calendar.days) {
    spent += daySpent(day, view);
    income += view === 'mine' ? day.yourIncome : day.income;
  }
  const toCome = calendar.events
    .filter((event) => event.type === 'recurringExpected' && event.kind === 'expense')
    .reduce((sum, event) => sum + eventAmount(event, view), 0);
  return { spent, income, toCome };
}

/**
 * What is left of the month's budgets (negative: over), or null without budgets. Budgets
 * are the household's (shared spending per category), whichever view is on.
 */
export function budgetLeft(budgets: BudgetList): number | null {
  if (budgets.budgets.length === 0) return null;
  return budgets.budgets.reduce((left, budget) => left + budget.amount - budget.spent, 0);
}
