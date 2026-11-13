import {
  type Calendar,
  type CalendarEvent,
  daysOfMonth,
  type RecurringSeries,
  type SavingsGoal,
} from '@splinance/shared';
import { cleanup, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { currentMonth } from '@/features/transactions/dates';
import { localeStore } from '@/lib/locale';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  authResponse,
  householdDetail,
  sentence,
  testHousehold,
  testUser,
} from '../../../test/utils';
import { dayBars, leftThisMonth, roughly } from './left';

const SERIES = '01a12509-0f61-75bc-b406-1301087805';

const expected = (
  fields: Partial<Extract<CalendarEvent, { type: 'recurringExpected' }>>,
): CalendarEvent => ({
  type: 'recurringExpected',
  date: '2026-11-25',
  seriesId: `${SERIES}01`,
  name: 'Rent',
  scope: 'shared',
  kind: 'expense',
  categoryId: null,
  amount: 200_000,
  amountVaries: false,
  yourAmount: 100_000,
  ...fields,
});

const rent = expected({});
const gas = expected({
  seriesId: `${SERIES}02`,
  name: 'Gas',
  date: '2026-11-28',
  amount: 48_900,
  amountVaries: true,
  yourAmount: null,
});
const salaryDue = expected({
  seriesId: `${SERIES}03`,
  name: 'Salary',
  kind: 'income',
  scope: 'private',
  date: '2026-11-15',
  amount: 690_000,
  yourAmount: 690_000,
});
/** Found already: in the day totals, so it must not count again. */
const netflixPaid: CalendarEvent = {
  type: 'recurringPaid',
  date: '2026-11-03',
  seriesId: `${SERIES}04`,
  name: 'Netflix',
  scope: 'shared',
  kind: 'expense',
  categoryId: null,
  amount: 4490,
  transactionId: '01a1250a-8673-7669-9f80-8f4006ca5ece',
  yourAmount: 2245,
};

/** November 2026 (30 days), seen on the 13th: 18 days left with today. */
function november({
  today = '2026-11-13',
  days = {},
  events = [],
}: {
  today?: string;
  days?: Record<string, Partial<Calendar['days'][number]>>;
  events?: CalendarEvent[];
} = {}): Calendar {
  return {
    month: '2026-11',
    today,
    currency: 'HUF',
    days: daysOfMonth('2026-11').map((date) => ({
      date,
      expenses: 0,
      income: 0,
      yourExpenses: 0,
      yourIncome: 0,
      count: 0,
      ...days[date],
    })),
    events,
  };
}

/** The salary arrived on the 10th; 312 400 Ft of the viewer's own spent since the 1st. */
const paid = {
  '2026-11-03': { expenses: 400_000, yourExpenses: 200_000, count: 3 },
  '2026-11-10': { income: 690_000, yourIncome: 690_000, expenses: 150_000, yourExpenses: 112_400 },
};

describe('left this month', () => {
  it('takes what was spent and what is still expected out of the income', () => {
    const month = leftThisMonth(november({ days: paid, events: [netflixPaid, rent, gas] }));
    expect(month).toMatchObject({
      received: 690_000,
      expectedIncome: 0,
      nextIncome: null,
      spent: 312_400,
      // The viewer's half of the rent, and the gas in full: nothing tells its split yet.
      toCome: 148_900,
      toComeCount: 2,
      toComeVaries: true,
      left: 228_700,
      daysLeft: 18,
      // 12 705 a day, said as a round figure.
      perDay: 12_700,
    });
  });

  it('counts income that is still expected, and names the soonest', () => {
    const month = leftThisMonth(
      november({
        today: '2026-11-03',
        days: { '2026-11-03': { expenses: 100_000, yourExpenses: 89_800 } },
        events: [salaryDue, rent],
      }),
    );
    expect(month).toMatchObject({
      received: 0,
      expectedIncome: 690_000,
      nextIncome: { name: 'Salary', date: '2026-11-15', amount: 690_000 },
      left: 500_200,
      daysLeft: 28,
    });
  });

  it('is nothing without income to measure against', () => {
    expect(leftThisMonth(november({ events: [rent] }))).toBeNull();
    expect(leftThisMonth(november())).toBeNull();
  });

  it('goes negative when the month costs more than it brings, with no daily figure', () => {
    const month = leftThisMonth(
      november({
        days: { '2026-11-10': { income: 300_000, yourIncome: 300_000, yourExpenses: 280_000 } },
        events: [rent],
      }),
    );
    expect(month).toMatchObject({ left: -80_000, perDay: null });
  });

  it('counts today among the days left, down to the last day', () => {
    const lastDay = leftThisMonth(november({ today: '2026-11-30', days: paid }));
    expect(lastDay).toMatchObject({ daysLeft: 1, left: 377_600, perDay: 377_600 });
    // The browser already in December, the server's month still November: never zero days.
    expect(leftThisMonth(november({ today: '2026-12-01', days: paid }))?.daysLeft).toBe(1);
  });

  it('rounds an estimate down to its first three digits', () => {
    expect(roughly(2_109_684)).toBe(2_100_000);
    expect(roughly(12_705)).toBe(12_700);
    expect(roughly(1000)).toBe(1000);
    expect(roughly(877)).toBe(877);
    expect(roughly(0)).toBe(0);
  });

  it("draws the viewer's share per day: past filled, today marked, days ahead as stubs", () => {
    const bars = dayBars(
      november({
        days: {
          '2026-11-03': { yourExpenses: 200_000 },
          '2026-11-10': { expenses: 90_000, yourExpenses: 50_000 },
          // Dated ahead: drawn as a stub, and not the scale either.
          '2026-11-20': { yourExpenses: 999_000 },
        },
      }),
    );
    expect(bars).toHaveLength(30);
    expect(bars[0]).toEqual({ date: '2026-11-01', when: 'past', level: 0 });
    expect(bars[2]).toEqual({ date: '2026-11-03', when: 'past', level: 1 });
    // By square root: a quarter of the busiest day is half a bar.
    expect(bars[9]).toEqual({ date: '2026-11-10', when: 'past', level: 0.5 });
    expect(bars[12]).toEqual({ date: '2026-11-13', when: 'today', level: 0 });
    expect(bars[19]).toEqual({ date: '2026-11-20', when: 'future', level: 0 });
    expect(bars.filter((bar) => bar.when === 'future')).toHaveLength(17);
  });

  it('draws an earlier month as all past, and flat without spending', () => {
    const bars = dayBars(november({ today: '2026-12-02' }));
    expect(new Set(bars.map((bar) => bar.when))).toEqual(new Set(['past']));
    expect(new Set(bars.map((bar) => bar.level))).toEqual(new Set([0]));
  });
});

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));
const base = `/api/households/${testHousehold.id}`;

/** The viewer's salary as a tracked series: nothing of it in the month's calendar. */
const salarySeries: RecurringSeries = {
  id: `${SERIES}a4`,
  kind: 'income',
  source: 'manual',
  createdBy: testUser.id,
  name: 'Salary',
  pattern: 'acme kft',
  cadence: 'monthly',
  amount: 690_000,
  amountVaries: false,
  anchorOn: '2026-11-10',
  startsOn: null,
  categoryId: null,
  scope: 'private',
  remind: true,
  payments: [],
  paymentCount: 0,
  lastPaidOn: null,
  latestAmount: 690_000,
  previousAmount: null,
  share: null,
  monthlyAmount: 690_000,
};

function fakeApi(calendar?: Calendar, { series = [] as RecurringSeries[] } = {}) {
  const asked: string[] = [];
  server.use(
    mock.get(`${base}/recurring`, () =>
      HttpResponse.json({
        recurring: { currency: 'HUF', series, suggestions: [], dismissed: [] },
      }),
    ),
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () => HttpResponse.json({ household: householdDetail() })),
    ...(calendar
      ? [
          mock.get(`${base}/calendar`, ({ request }) => {
            asked.push(new URL(request.url).search);
            return HttpResponse.json({ calendar });
          }),
        ]
      : []),
  );
  return asked;
}

async function card(heading: string) {
  const title = await screen.findByRole('heading', { name: heading });
  const element = title.closest('[data-slot="card"]');
  if (!(element instanceof HTMLElement)) throw new Error('no card');
  return element;
}

describe('overview: left this month', () => {
  afterEach(() => {
    void localeStore.setLocale('en', { persist: false });
    localStorage.clear();
  });

  it('shows what is left, a day, and the sum behind it on request', async () => {
    const user = userEvent.setup();
    const asked = fakeApi(november({ days: paid, events: [netflixPaid, rent, gas] }));
    renderRoute(`/h/${testHousehold.id}`);

    const left = await card('Left this month');
    // Only the current month, without a category.
    expect(new Set(asked)).toEqual(new Set([`?month=${currentMonth()}`]));
    expect(within(left).getByText(money('^228 700 Ft$'), { selector: '.sr-only' })).toBeDefined();
    expect(within(left).getByText(sentence('About 12 700 Ft a day for 18 days'))).toBeVisible();
    // Its parts as chips; nothing set aside, so no chip for it.
    expect(
      within(left)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(money('^Spent312 400 Ft$')),
      expect.stringMatching(money('^To come148 900 Ft$')),
    ]);
    // The month by day, decoration only: 12 days gone, today, 17 ahead.
    const bars = within(left).getByTestId('day-bars');
    expect(bars).toHaveAttribute('aria-hidden', 'true');
    expect(bars.querySelectorAll('[data-when="past"]')).toHaveLength(12);
    expect(bars.querySelectorAll('[data-when="today"]')).toHaveLength(1);
    expect(bars.querySelectorAll('[data-when="future"]')).toHaveLength(17);
    // The page's one tinted surface.
    expect(left).toHaveClass('bg-positive-tint');
    expect(within(left).getByRole('link', { name: 'See the month' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}/calendar?view=mine`,
    );

    const how = within(left).getByRole('button', { name: 'How is this calculated' });
    expect(how).toHaveAttribute('aria-expanded', 'false');
    expect(within(left).queryByText('Income received')).toBeNull();
    await user.click(how);
    expect(how).toHaveAttribute('aria-expanded', 'true');
    const rows = within(left)
      .getAllByRole('term')
      .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent ?? ''}`);
    expect(rows).toEqual([
      expect.stringMatching(money('^Income received: \\+690 000 Ft$')),
      expect.stringMatching(money('^Spent so far: [-−]312 400 Ft$')),
      expect.stringMatching(money('^Recurring still to come · 2 payments: about [-−]148 900 Ft$')),
    ]);
    // Still opening (the height animates): there, if not yet fully shown.
    expect(within(left).getByText(/^Your share only\./)).toBeInTheDocument();
  });

  it('names the income it is still waiting for', async () => {
    fakeApi(
      november({
        today: '2026-11-03',
        days: { '2026-11-03': { expenses: 100_000, yourExpenses: 89_800 } },
        events: [salaryDue, rent],
      }),
    );
    renderRoute(`/h/${testHousehold.id}`);

    const left = await card('Left this month');
    expect(
      within(left).getByText(sentence('Includes Salary: 690 000 Ft expected 15 Nov')),
    ).toBeVisible();
    expect(within(left).queryByText(/a day for/)).toBeNull();
  });

  it('says by how much the month is over its income', async () => {
    fakeApi(
      november({
        days: { '2026-11-10': { income: 300_000, yourIncome: 300_000, yourExpenses: 280_000 } },
        events: [rent],
      }),
    );
    renderRoute(`/h/${testHousehold.id}`);

    const over = await card('Over this month');
    expect(within(over).getByText(money('^80 000 Ft$'), { selector: '.sr-only' })).toBeDefined();
    expect(within(over).getByText(sentence('100 000 Ft of payments still to come'))).toBeVisible();
    expect(
      within(over)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(money('^Spent280 000 Ft$')),
      expect.stringMatching(money('^To come100 000 Ft$')),
    ]);
    expect(over).toHaveClass('bg-negative-tint');
  });

  it('offers to track a salary when there is no income to go by', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}`);

    const nudge = await card('See what is left each month');
    expect(within(nudge).getByRole('link', { name: 'Add income' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}/recurring/new?kind=income`,
    );
    expect(screen.queryByText('Left this month')).toBeNull();
  });

  it('asks for the income itself once a salary is tracked', async () => {
    fakeApi(undefined, { series: [salarySeries] });
    renderRoute(`/h/${testHousehold.id}`);

    const waiting = await card('No income yet this month');
    expect(within(waiting).getByText(/has not shown up yet/)).toBeVisible();
    expect(within(waiting).getByRole('link', { name: 'Add transaction' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}/transactions/new`,
    );
    expect(screen.queryByRole('link', { name: 'Add income' })).toBeNull();
  });

  it('hides the offer for good in this browser, for this household only', async () => {
    const user = userEvent.setup();
    fakeApi();
    renderRoute(`/h/${testHousehold.id}`);

    const nudge = await card('See what is left each month');
    await user.click(within(nudge).getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('See what is left each month')).toBeNull();
    expect(localStorage.getItem(`splinance-left-nudge-hidden:${testUser.id}`)).toBe(
      JSON.stringify([testHousehold.id]),
    );

    // Still hidden on the next visit.
    cleanup();
    renderRoute(`/h/${testHousehold.id}`);
    await screen.findByRole('heading', { name: 'Members' });
    expect(screen.queryByText('See what is left each month')).toBeNull();
  });

  it('shows the month whatever was hidden once there is income', async () => {
    localStorage.setItem(
      `splinance-left-nudge-hidden:${testUser.id}`,
      JSON.stringify([testHousehold.id]),
    );
    fakeApi(november({ days: paid }));
    renderRoute(`/h/${testHousehold.id}`);
    expect(await card('Left this month')).toBeVisible();
  });

  it('is in Hungarian when the language is', async () => {
    await localeStore.setLocale('hu', { persist: false });
    fakeApi(november({ days: paid, events: [rent, gas] }));
    renderRoute(`/h/${testHousehold.id}`);

    const left = await card('Ebből a hónapból maradt');
    expect(within(left).getByText(sentence('Naponta kb. 12 700 Ft, még 18 napig'))).toBeVisible();
    expect(within(left).getByRole('button', { name: 'Hogyan számoljuk?' })).toBeVisible();
  });
});

describe('left this month, with savings', () => {
  const month = (setAside: number, calendar = november({ days: paid, events: [rent, gas] })) => {
    const result = leftThisMonth(calendar, setAside);
    if (!result) throw new Error('no month');
    return result;
  };

  it('takes what was set aside out of what is left', () => {
    expect(month(100_000)).toMatchObject({ setAside: 100_000, left: 128_700, perDay: 7150 });
  });

  it('gives money taken out of savings back to the month', () => {
    expect(month(-50_000)).toMatchObject({ setAside: -50_000, left: 278_700 });
    // Spending it afterwards is neutral: the month ends where it would have without savings.
    const spentIt = month(
      -50_000,
      november({
        days: { ...paid, '2026-11-12': { expenses: 50_000, yourExpenses: 50_000 } },
        events: [rent, gas],
      }),
    );
    expect(spentIt.left).toBe(228_700);
  });

  it('can push the month over its income, and savings taken out help cover it', () => {
    const tight = november({
      days: { '2026-11-10': { income: 300_000, yourIncome: 300_000, yourExpenses: 250_000 } },
    });
    expect(month(80_000, tight).left).toBe(-30_000);
    const covered = month(-20_000, {
      ...tight,
      days: tight.days.map((day) =>
        day.date === '2026-11-10' ? { ...day, yourExpenses: 350_000 } : day,
      ),
    });
    expect(covered.left).toBe(-30_000);
  });

  it('still needs income to measure against', () => {
    expect(leftThisMonth(november(), 100_000)).toBeNull();
  });
});

describe('overview: savings', () => {
  const person = { userId: testUser.id, displayName: testUser.displayName };
  const goal = (id: string, name: string, fields: Partial<SavingsGoal>): SavingsGoal => ({
    id: `${SERIES}${id}`,
    name,
    targetAmount: 600_000,
    targetDate: null,
    currency: 'HUF',
    visibility: 'shared',
    createdBy: person,
    archivedAt: null,
    balance: 0,
    contributions: [],
    pinned: false,
    createdAt: '2026-10-09T16:06:43.129Z',
    ...fields,
  });
  const trip = goal('b1', 'Summer in Italy', {
    targetDate: '2027-07-01',
    balance: 420_000,
    contributions: [{ ...person, amount: 420_000 }],
  });
  const fund = goal('b2', 'Emergency fund', { targetAmount: 2_000_000, balance: 1_150_000 });
  const pot = goal('b3', 'Rainy day pot', { targetAmount: null, balance: 90_000 });
  const old = goal('b4', 'Old sofa', { archivedAt: '2026-09-01T10:00:00.000Z' });

  function savingsApi(goals: SavingsGoal[], setAside: number) {
    server.use(
      mock.get(`${base}/savings`, () =>
        HttpResponse.json({ savings: { currency: 'HUF', goals, setAside } }),
      ),
    );
  }

  it('takes what was set aside out of the card, with a chip and a row of its own', async () => {
    const user = userEvent.setup();
    fakeApi(november({ days: paid, events: [rent, gas] }));
    savingsApi([trip], 100_000);
    renderRoute(`/h/${testHousehold.id}`);

    const left = await card('Left this month');
    expect(
      await within(left).findByText(money('^128 700 Ft$'), { selector: '.sr-only' }),
    ).toBeDefined();
    expect(
      within(left)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(money('^Spent312 400 Ft$')),
      expect.stringMatching(money('^Set aside100 000 Ft$')),
      expect.stringMatching(money('^To come148 900 Ft$')),
    ]);

    await user.click(within(left).getByRole('button', { name: 'How is this calculated' }));
    const rows = within(left)
      .getAllByRole('term')
      .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent ?? ''}`);
    expect(rows).toContainEqual(
      expect.stringMatching(money('^Set aside in savings: [-−]100 000 Ft$')),
    );
  });

  it('says so when savings came back instead', async () => {
    const user = userEvent.setup();
    fakeApi(november({ days: paid, events: [rent, gas] }));
    savingsApi([trip], -50_000);
    renderRoute(`/h/${testHousehold.id}`);

    const left = await card('Left this month');
    expect(
      await within(left).findByText(money('^278 700 Ft$'), { selector: '.sr-only' }),
    ).toBeDefined();
    expect(within(left).queryByText('Set aside')).toBeNull();
    await user.click(within(left).getByRole('button', { name: 'How is this calculated' }));
    const rows = within(left)
      .getAllByRole('term')
      .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent ?? ''}`);
    expect(rows).toContainEqual(
      expect.stringMatching(money('^Taken out of savings: \\+50 000 Ft$')),
    );
  });

  it('rings the goal picked for the viewer, or their pins, with a link to each', async () => {
    fakeApi(november({ days: paid }));
    savingsApi([trip, fund, pot, old], 0);
    renderRoute(`/h/${testHousehold.id}`);

    const savings = await card('Savings');
    // Nothing pinned: the one with the nearest date.
    const items = within(savings).getAllByRole('listitem');
    expect(items.map((item) => item.textContent.replace(/\s/g, ' '))).toEqual([
      // The ring's percent (decoration), the name, the amounts and the next step.
      expect.stringMatching(/^70%Summer in Italy420 000 Ft of 600 000 Ft30 000 Ft to 75%$/),
    ]);
    expect(within(savings).getByRole('link', { name: 'Summer in Italy' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}/savings/${trip.id}`,
    );
    expect(within(savings).getByRole('link', { name: 'All goals' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}/savings`,
    );

    cleanup();
    const week = goal('b5', 'Week away', { pinned: true });
    savingsApi([trip, { ...fund, pinned: true }, { ...pot, pinned: true }, week, old], 0);
    renderRoute(`/h/${testHousehold.id}`);
    const pinned = await card('Savings');
    // Two rings at most; a goal without a target has an empty one and no percent.
    const goals = within(pinned).getAllByRole('listitem');
    expect(goals.map((item) => within(item).getByRole('link').textContent)).toEqual([
      'Emergency fund',
      'Rainy day pot',
    ]);
    expect(goals[1]).not.toHaveTextContent('%');
  });

  it('falls back to any open goal, and hides without one', async () => {
    fakeApi(november({ days: paid }));
    savingsApi([pot, old], 0);
    renderRoute(`/h/${testHousehold.id}`);
    const savings = await card('Savings');
    expect(within(savings).getByRole('link', { name: 'Rainy day pot' })).toBeVisible();

    cleanup();
    savingsApi([old], 0);
    renderRoute(`/h/${testHousehold.id}`);
    await card('Left this month');
    expect(screen.queryByRole('heading', { name: 'Savings' })).toBeNull();
  });
});
