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

/** One slice of the bar: its share is its amount against the others'. */
export interface LeftSegment {
  key: 'spent' | 'toCome' | 'setAside' | 'left' | 'covered' | 'over';
  amount: number;
}

/**
 * The bar under the number. Within income it is the income (plus what came back out of
 * savings), split into spent, still to come, set aside and left. Over it, the bar turns into everything going out, split into what the
 * income covers and what it does not (three slices cannot add up to more than the whole).
 * Empty slices are left out.
 */
export function leftSegments(month: LeftThisMonth): LeftSegment[] {
  const segments: LeftSegment[] =
    month.left >= 0
      ? [
          { key: 'spent', amount: month.spent },
          { key: 'toCome', amount: month.toCome },
          { key: 'setAside', amount: Math.max(0, month.setAside) },
          { key: 'left', amount: month.left },
        ]
      : [
          {
            key: 'covered',
            amount: month.received + month.expectedIncome + Math.max(0, -month.setAside),
          },
          { key: 'over', amount: -month.left },
        ];
  return segments.filter((segment) => segment.amount > 0);
}
