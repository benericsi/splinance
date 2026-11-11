import {
  type Calendar,
  type CalendarEvent,
  type Category,
  daysOfMonth,
  type Transaction,
} from '@splinance/shared';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { localeStore } from '@/lib/locale';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, householdDetail, testHousehold, testUser } from '../../../test/utils';
import {
  budgetLeft,
  changeAgainst,
  daysElapsed,
  eventAmount,
  leadingBlanks,
  spendLevel,
  spentThrough,
  summarize,
} from './view';

const anna = { userId: testUser.id, displayName: testUser.displayName };
const ben = { userId: '01a112be-f8eb-73bb-b534-400e393821c4', displayName: 'Ben' };
const SERIES = '01a12509-0f61-75bc-b406-1301087805';

const netflix: CalendarEvent = {
  type: 'recurringPaid',
  date: '2026-10-03',
  seriesId: `${SERIES}01`,
  name: 'Netflix',
  scope: 'shared',
  categoryId: null,
  amount: 4490,
  transactionId: '01a1250a-8673-7669-9f80-8f4006ca5ece',
  yourAmount: 2245,
};
const gym: CalendarEvent = {
  type: 'recurringExpected',
  date: '2026-10-25',
  seriesId: `${SERIES}02`,
  name: 'Gym',
  scope: 'private',
  categoryId: null,
  amount: 14_900,
  amountVaries: false,
  yourAmount: 14_900,
};
const gas: CalendarEvent = {
  type: 'recurringExpected',
  date: '2026-10-25',
  seriesId: `${SERIES}03`,
  name: 'Gas',
  scope: 'shared',
  categoryId: null,
  amount: 18_000,
  amountVaries: true,
  yourAmount: null,
};
const settled: CalendarEvent = {
  type: 'settlement',
  date: '2026-10-12',
  settlementId: `${SERIES}04`,
  from: ben,
  to: anna,
  amount: 5000,
};

const spending: Record<string, Partial<Calendar['days'][number]>> = {
  '2026-10-03': { expenses: 4490, yourExpenses: 2245, count: 1 },
  '2026-10-10': { expenses: 13_000, yourExpenses: 8000, count: 2 },
};

const october: Calendar = {
  month: '2026-10',
  today: '2026-10-20',
  currency: 'HUF',
  days: daysOfMonth('2026-10').map((date) => ({
    date,
    expenses: 0,
    income: 0,
    yourExpenses: 0,
    yourIncome: 0,
    count: 0,
    ...spending[date],
  })),
  events: [netflix, settled, gas, gym],
};

const shop: Transaction = {
  id: '01a1250a-8673-7669-9f80-8f4006ca5ecf',
  kind: 'expense',
  visibility: 'shared',
  amount: 10_000,
  currency: 'HUF',
  occurredOn: '2026-10-10',
  description: 'Weekly shop',
  categoryId: null,
  counterparty: null,
  importBatchId: null,
  paidBy: anna,
  createdBy: anna,
  split: {
    method: 'equal',
    shares: [
      { ...anna, amount: 5000, basisPoints: null },
      { ...ben, amount: 5000, basisPoints: null },
    ],
  },
  version: 1,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};

const groceries: Category = {
  id: '01a12509-0f61-75bc-b406-130108780501',
  name: 'Groceries',
  kind: 'expense',
  icon: 'tag',
  color: 'green',
  archivedAt: null,
};
const salary: Category = { ...groceries, id: `${SERIES}99`, name: 'Salary', kind: 'income' };

const base = `/api/households/${testHousehold.id}`;
const page = `/h/${testHousehold.id}/calendar?month=2026-10`;

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));

function fakeApi({ budgets = [] as { amount: number; spent: number }[] } = {}) {
  const asked = { months: [] as string[], days: [] as string[] };
  const blank = (month: string) =>
    daysOfMonth(month).map((date) => ({
      date,
      expenses: 0,
      income: 0,
      yourExpenses: 0,
      yourIncome: 0,
      count: 0,
    }));
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () => HttpResponse.json({ household: householdDetail() })),
    mock.get(`${base}/categories`, () => HttpResponse.json({ categories: [groceries, salary] })),
    mock.get(`${base}/calendar`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const month = params.get('month') ?? '';
      const categoryId = params.get('categoryId');
      asked.months.push(categoryId ? `${month} ${categoryId}` : month);
      // One category: October without its events, and 10 000 Ft on 5 September before it.
      if (categoryId) {
        return HttpResponse.json({
          calendar:
            month === october.month
              ? { ...october, events: [] }
              : {
                  ...october,
                  month,
                  events: [],
                  days: blank(month).map((day) =>
                    day.date === '2026-09-05'
                      ? { ...day, expenses: 10_000, yourExpenses: 5000, count: 1 }
                      : day,
                  ),
                },
        });
      }
      return HttpResponse.json({
        calendar:
          month === october.month
            ? october
            : {
                ...october,
                month,
                days: daysOfMonth(month).map((date) => ({
                  date,
                  expenses: 0,
                  income: 0,
                  yourExpenses: 0,
                  yourIncome: 0,
                  count: 0,
                })),
                events: [],
              },
      });
    }),
    mock.get(`${base}/budgets`, ({ request }) =>
      HttpResponse.json({
        budgets: {
          month: new URL(request.url).searchParams.get('month') ?? '',
          currency: 'HUF',
          budgets: budgets.map((budget, index) => ({
            categoryId: `01a12509-0f61-75bc-b406-13010878060${String(index)}`,
            since: '2026-01',
            ...budget,
          })),
        },
      }),
    ),
    mock.get(`${base}/transactions`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const on = params.get('on') ?? '';
      const categoryId = params.get('categoryId');
      asked.days.push(categoryId ? `${on} ${categoryId}` : on);
      return HttpResponse.json({
        transactions: on === shop.occurredOn ? [shop] : [],
        nextCursor: null,
      });
    }),
  );
  return asked;
}

const days = async () =>
  screen.findByRole('list', { name: 'Days of October 2026' }, { timeout: 5000 });

const stat = (label: string) => screen.getByText(label).parentElement;

describe('calendar page', () => {
  it('shows the month from Monday, with totals, events and what is still to come', async () => {
    const asked = fakeApi({ budgets: [{ amount: 50_000, spent: 13_000 }] });
    renderRoute(page);

    const grid = await days();
    expect(asked.months).toEqual(['2026-10']);
    // 1 October 2026 is a Thursday: three empty cells, 31 days, and one to end the last week.
    expect(grid.querySelectorAll('li[aria-hidden]')).toHaveLength(3 + 1);
    expect(within(grid).getAllByRole('link')).toHaveLength(31);

    const third = within(grid).getByRole('link', { name: / 3 October/ });
    expect(third).toHaveAccessibleName(money('spent 4490 Ft, 1 event$'));
    expect(third).toHaveTextContent('Netflix');
    expect(within(grid).getByRole('link', { name: /10 October/ })).toHaveAccessibleName(
      money('spent 13 000 Ft$'),
    );
    expect(within(grid).getByRole('link', { name: /12 October/ })).toHaveTextContent(
      'Ben paid you',
    );
    // Two expected payments: the first as a chip, the other counted.
    const later = within(grid).getByRole('link', { name: /25 October/ });
    expect(later).toHaveAccessibleName(/, 2 events$/);
    expect(later).toHaveTextContent('Gas');
    expect(later).toHaveTextContent('+1 more');
    expect(within(grid).getByRole('link', { name: /^Thursday 1 October, nothing$/ })).toBeVisible();

    expect(stat('Spent')).toHaveTextContent(money('17 490 Ft'));
    expect(stat('Still to come')).toHaveTextContent(money('32 900 Ft'));
    expect(stat('Budget left')).toHaveTextContent(money('37 000 Ft'));
    expect(screen.getByRole('list', { name: 'What the marks mean' })).toHaveTextContent(
      'Recurring, paidExpectedSettle-upDarker days: more spent',
    );
  });

  it('switches to the viewer’s share, and shows income without budgets', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    const grid = await days();
    expect(stat('Income')).toHaveTextContent(money('0 Ft'));

    const view = screen.getByRole('group', { name: 'Whose spending' });
    await user.click(within(view).getByRole('button', { name: 'Your share' }));

    expect(await screen.findByText('You spent')).toBeVisible();
    expect(stat('You spent')).toHaveTextContent(money('10 245 Ft'));
    expect(within(grid).getByRole('link', { name: /10 October/ })).toHaveAccessibleName(
      money('spent 8000 Ft$'),
    );
    expect(within(grid).getByRole('link', { name: / 3 October/ })).toHaveTextContent('Netflix2245');
    expect(stat('Your income')).toBeVisible();
  });

  it('opens a day with its events and transactions', async () => {
    const asked = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    const grid = await days();

    await user.click(within(grid).getByRole('link', { name: /10 October/ }));
    const dialog = await screen.findByRole('dialog', { name: /10 Oct/ });
    expect(asked.days).toEqual(['2026-10-10']);
    expect(dialog).toHaveTextContent(money('Spent 13 000 Ft'));
    const transactions = within(dialog).getByRole('region', { name: 'Transactions' });
    expect(within(transactions).getByRole('link', { name: /Weekly shop/ })).toHaveAttribute(
      'href',
      expect.stringContaining(`/transactions/${shop.id}`),
    );
    expect(within(dialog).queryByRole('region', { name: 'Recurring and settle-ups' })).toBeNull();
  });

  it('shows an expected payment as an estimate, linked to its series', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/calendar/2026-10-25?month=2026-10`);

    const dialog = await screen.findByRole('dialog', { name: /25 Oct/ });
    const marked = within(dialog).getByRole('region', { name: 'Recurring and settle-ups' });
    const gasRow = within(marked).getByRole('link', { name: /Gas/ });
    expect(gasRow).toHaveTextContent(money('GasExpectedabout 18 000 Ft'));
    expect(gasRow).toHaveAttribute('href', expect.stringContaining(`/recurring/${gas.seriesId}`));
    expect(within(marked).getByRole('link', { name: /Gym/ })).toHaveTextContent(
      money('GymExpected14 900 Ft'),
    );
    expect(within(dialog).queryByRole('region', { name: 'Transactions' })).toBeNull();
  });

  it('says so when a day has nothing', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/calendar/2026-10-01?month=2026-10`);
    const dialog = await screen.findByRole('dialog', { name: /1 Oct/ });
    expect(dialog).toHaveTextContent('Nothing on this day.');
  });

  it('steps to another month, and keeps the month when switching to the list', async () => {
    const asked = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    await days();

    const views = screen.getByRole('navigation', { name: 'View' });
    expect(within(views).getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(views).getByRole('link', { name: 'List' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/transactions\?month=2026-10$/),
    );

    await user.click(screen.getByRole('link', { name: 'Previous month' }));
    const september = await screen.findByRole('list', { name: 'Days of September 2026' });
    expect(within(september).getAllByRole('link')).toHaveLength(30);
    expect(asked.months).toEqual(['2026-10', '2026-09']);
  });

  it('narrows the month to a category, and compares it with the month before', async () => {
    const asked = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    const grid = await days();

    // Only categories spending can have.
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(screen.queryByRole('option', { name: 'Salary' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: 'Groceries' }));

    expect(await screen.findByText('Days with spending')).toBeVisible();
    expect(asked.months).toEqual(['2026-10', `2026-10 ${groceries.id}`, `2026-09 ${groceries.id}`]);
    expect(stat('Spent')).toHaveTextContent(money('17 490 Ft'));
    expect(stat('Days with spending')).toHaveTextContent('2 days');
    // October is over: all of it against all of September (30 days), 17 490 after 10 000.
    expect(stat('vs 1–30 Sept')).toHaveTextContent(/^vs 1–30 Sept\+75\s?%$/);
    expect(stat('vs 1–30 Sept')?.querySelector('dd')).toHaveClass('text-negative');

    // Days with spending in it carry the category's tile; the others do not.
    const tile = (name: RegExp) =>
      within(grid).getByRole('link', { name }).querySelector('span.rounded-md[aria-hidden]');
    expect(tile(/ 3 October/)).not.toBeNull();
    expect(tile(/10 October/)).not.toBeNull();
    expect(tile(/12 October/)).toBeNull();
    expect(within(grid).getByRole('link', { name: /12 October/ })).toHaveAccessibleName(
      /, nothing$/,
    );

    // The day follows the category.
    await user.click(within(grid).getByRole('link', { name: /10 October/ }));
    await screen.findByRole('dialog', { name: /10 Oct/ });
    expect(asked.days).toEqual([`2026-10-10 ${groceries.id}`]);
  });

  it('says so when the category had nothing the month before', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/calendar?month=2026-08&category=${groceries.id}`);
    await screen.findByRole('list', { name: 'Days of August 2026' });
    // Nothing in August, nothing in July.
    expect(stat('vs 1–31 Jul')).toHaveTextContent(/^vs 1–31 Jul–$/);
    expect(stat('Days with spending')).toHaveTextContent('0 days');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Groceries');
  });

  it('is in Hungarian when the language is', async () => {
    await localeStore.setLocale('hu', { persist: false });
    fakeApi({ budgets: [{ amount: 10_000, spent: 13_000 }] });
    renderRoute(page);

    const grid = await screen.findByRole('list', { name: 'Napok · 2026. október' });
    expect(screen.getByRole('heading', { name: 'Naptár', level: 1 })).toBeVisible();
    expect(within(grid).getByRole('link', { name: /október 3\./ })).toHaveAccessibleName(
      money('költés: 4490 Ft, 1 esemény$'),
    );
    expect(within(grid).getByRole('link', { name: /október 12\./ })).toHaveTextContent(
      'Ben fizetett neked',
    );
    expect(within(grid).getByRole('link', { name: /október 25\./ })).toHaveTextContent(
      '+1 további',
    );
    expect(stat('Még várható')).toHaveTextContent(money('32 900 Ft'));
    expect(stat('Keret túllépve')).toHaveTextContent(money('3000 Ft'));
    expect(screen.getByRole('group', { name: 'Kinek a költése' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Kategória' })).toHaveTextContent(
      'Minden kategória',
    );
    expect(screen.getByRole('list', { name: 'A jelölések magyarázata' })).toHaveTextContent(
      'Rendszeres, kifizetveVárhatóElszámolásSötétebb nap: több költés',
    );
    expect(document.body).not.toHaveTextContent(/Still to come|Spent|Expected|Settle-up/);
  });

  it('is in Hungarian for a category too', async () => {
    await localeStore.setLocale('hu', { persist: false });
    fakeApi();
    renderRoute(`${page}&category=${groceries.id}`);
    await screen.findByRole('list', { name: 'Napok · 2026. október' });
    expect(stat('Költéses napok')).toHaveTextContent('2 nap');
    expect(stat('Előtte: szept. 1–30.')).toHaveTextContent(/\+75\s?%$/);
    expect(document.body).not.toHaveTextContent(/Days with spending|All categories|vs /);
  });
});

describe('calendar view logic', () => {
  it('starts weeks on Monday', () => {
    // 1 June 2026 is a Monday, 1 November 2026 a Sunday.
    expect(leadingBlanks('2026-06')).toBe(0);
    expect(leadingBlanks('2026-11')).toBe(6);
    expect(leadingBlanks('2026-10')).toBe(3);
  });

  it('grades days against the busiest one, and never hides a small one', () => {
    expect(spendLevel(0, 100_000)).toBe(0);
    expect(spendLevel(500, 180_000)).toBe(1);
    expect(spendLevel(20_000, 180_000)).toBe(2);
    expect(spendLevel(180_000, 180_000)).toBe(4);
    expect(spendLevel(5000, 0)).toBe(0);
  });

  it('counts an expected payment with an unknown split in full', () => {
    expect(eventAmount(gas, 'mine')).toBe(18_000);
    expect(eventAmount(netflix, 'mine')).toBe(2245);
    expect(eventAmount(netflix, 'household')).toBe(4490);
    expect(eventAmount(settled, 'mine')).toBe(5000);
    expect(summarize(october, 'mine')).toEqual({ spent: 10_245, income: 0, toCome: 32_900 });
  });

  it('compares a month in progress with the same days of the month before', () => {
    expect(daysElapsed('2026-10', '2026-10-11')).toBe(11);
    expect(daysElapsed('2026-09', '2026-10-11')).toBe(31);
    expect(daysElapsed('2026-11', '2026-10-11')).toBe(0);
    // Through the 9th: only the 3rd counts; through the 10th both days do.
    expect(spentThrough(october, 'household', 9)).toBe(4490);
    expect(spentThrough(october, 'household', 10)).toBe(17_490);
    expect(changeAgainst(104, 100)).toBeCloseTo(0.04);
    expect(changeAgainst(50, 100)).toBe(-0.5);
    expect(changeAgainst(50, 0)).toBe('new');
    expect(changeAgainst(0, 0)).toBeNull();
  });

  it('adds up what is left of the budgets, or says there are none', () => {
    const list = (budgets: { amount: number; spent: number }[]) => ({
      month: '2026-10',
      currency: 'HUF' as const,
      budgets: budgets.map((b) => ({ categoryId: 'c', since: '2026-01', ...b })),
    });
    expect(budgetLeft(list([]))).toBeNull();
    expect(
      budgetLeft(
        list([
          { amount: 50_000, spent: 20_000 },
          { amount: 10_000, spent: 15_000 },
        ]),
      ),
    ).toBe(25_000);
  });
});
