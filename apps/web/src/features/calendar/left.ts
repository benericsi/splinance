import type { Calendar } from '@splinance/shared';
import { eventAmount, summarize } from './view';

/** The viewer's month as money in against money out, for the overview's "Left this month". */
export interface LeftThisMonth {
  /** Income that arrived this month (the viewer's part). */
  received: number;
  /** Income tracked series should still bring this month. */
  expectedIncome: number;
  /** The soonest income still expected, to name it while it has not arrived. */
  nextIncome: { name: string; date: string; amount: number } | null;
  /** Spent so far (the viewer's part). */
  spent: number;
  /** Recurring payments still expected this month (the viewer's part). */
  toCome: number;
  toComeCount: number;
  /** One of them is an estimate ("about"). */
  toComeVaries: boolean;
  /**
   * What the viewer put into savings goals this month, net of what they took out. Negative
   * when more came out than went in: that money is back to spend.
   */
  setAside: number;
  /**
   * Income minus spent, still to come and set aside; negative when the month is over its
   * income.
   */
  left: number;
  /** Days of the month still ahead, today included (at least 1). */
  daysLeft: number;
  /** `left` spread over `daysLeft`, rounded down to a round figure; null when nothing is left. */
  perDay: number | null;
}

/**
 * What is left of the viewer's income this month once everything spent, every recurring
 * payment still expected and what they set aside in savings is taken out. Only their own part counts (private money, their
 * share of shared spending), so a debt to a partner is in it already. Null without any
 * income, received or expected: there is nothing to measure against.
 *
 * Found recurring payments are in the day totals; only the expected ones are added, so
 * nothing counts twice. Saving is not spending, so it is not in the day totals either:
 * `setAside` comes from the savings goals. Money taken out of a goal and then spent stays
 * neutral: it lowers `setAside` and raises `spent`. The app knows no bank balance: this is
 * the month, not the account.
 */
export function leftThisMonth(calendar: Calendar, setAside = 0): LeftThisMonth | null {
  const { spent, income: received, toCome } = summarize(calendar, 'mine');
  const expected = calendar.events.filter((event) => event.type === 'recurringExpected');
  const payments = expected.filter((event) => event.kind === 'expense');
  const incomes = expected.filter((event) => event.kind === 'income');
  const expectedIncome = incomes.reduce((sum, event) => sum + eventAmount(event, 'mine'), 0);
  if (received + expectedIncome === 0) return null;

  // Events come sorted by date: the first is the soonest.
  const [next] = incomes;
  const left = received + expectedIncome - spent - toCome - setAside;
  const daysLeft = daysLeftIn(calendar.month, calendar.today, calendar.days.length);
  return {
    received,
    expectedIncome,
    nextIncome: next
      ? { name: next.name, date: next.date, amount: eventAmount(next, 'mine') }
      : null,
    spent,
    toCome,
    toComeCount: payments.length,
    toComeVaries: payments.some((event) => event.amountVaries),
    setAside,
    left,
    daysLeft,
    // The last day has the whole of it; before that it is an estimate, and reads like one.
    perDay: left > 0 ? (daysLeft === 1 ? left : roughly(Math.floor(left / daysLeft))) : null,
  };
}

/**
 * An amount as an "about" figure: its first three digits, the rest zero (2 109 684 becomes
 * 2 100 000, 12 705 becomes 12 700). Always down: better to promise too little a day.
 */
export function roughly(amount: number): number {
  if (amount < 1000) return amount;
  const step = 10 ** (String(amount).length - 3);
  return Math.floor(amount / step) * step;
}

/** Today through the end of the month; 1 when the browser's month and the server's differ. */
function daysLeftIn(month: string, today: string, daysInMonth: number): number {
  if (today.slice(0, 7) !== month) return month > today.slice(0, 7) ? daysInMonth : 1;
  return Math.max(1, daysInMonth - Number(today.slice(8)) + 1);
}

/** One day of the month under the hero's number. */
export interface DayBar {
  date: string;
  when: 'past' | 'today' | 'future';
  /** The viewer's share spent that day; 0 ahead of today. */
  amount: number;
  /**
   * The viewer's spending that day against the month's busiest day so far, 0 to 1, by
   * square root (like the calendar's tint) so the rent does not flatten every other day.
   * Always 0 ahead of today.
   */
  level: number;
}

/**
 * The viewer's share spent per day of the month (`yourExpenses`), for the bars under the
 * hero's number: past days filled, today marked, days ahead as stubs. A month before the
 * browser's is all past, one after it all ahead.
 */
export function dayBars(calendar: Calendar): DayBar[] {
  const { today } = calendar;
  const when = (date: string): DayBar['when'] =>
    date < today ? 'past' : date === today ? 'today' : 'future';
  const max = Math.max(
    0,
    ...calendar.days.filter((day) => day.date <= today).map((day) => day.yourExpenses),
  );
  return calendar.days.map((day) => {
    const state = when(day.date);
    return {
      date: day.date,
      when: state,
      amount: state === 'future' ? 0 : day.yourExpenses,
      level: state === 'future' || max === 0 ? 0 : Math.sqrt(day.yourExpenses / max),
    };
  });
}

/**
 * Where a day's label sits against its bar: centred, except near the ends, where it starts
 * at the first bar or ends at the bar so it never sticks out of the hero.
 */
export function labelAlign(index: number, count: number): 'start' | 'center' | 'end' {
  if (index < 3) return 'start';
  if (index > count - 4) return 'end';
  return 'center';
}
