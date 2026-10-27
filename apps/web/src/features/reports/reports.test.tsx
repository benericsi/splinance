import { type Category, monthsBetween, type Report } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, householdDetail, testHousehold } from '../../../test/utils';

const category = (id: string, name: string, color: Category['color']): Category => ({
  id,
  name,
  kind: 'expense',
  icon: 'tag',
  color,
  archivedAt: null,
});

const groceries = category('01a12509-0f61-75bc-b406-130108780501', 'Groceries', 'green');
const eatingOut = category('01a12509-0f61-75bc-b406-130108780502', 'Eating out', 'orange');

const empty = (month: string) => ({
  month,
  expenses: 0,
  income: 0,
  yourExpenses: 0,
  yourIncome: 0,
});

const report: Report = {
  from: '2026-05',
  to: '2026-10',
  currency: 'HUF',
  months: [
    empty('2026-05'),
    empty('2026-06'),
    empty('2026-07'),
    empty('2026-08'),
    { month: '2026-09', expenses: 2000, income: 0, yourExpenses: 1000, yourIncome: 0 },
    {
      month: '2026-10',
      expenses: 20_000,
      income: 40_000,
      yourExpenses: 11_500,
      yourIncome: 20_000,
    },
  ],
  categories: [
    { month: '2026-09', categoryId: groceries.id, expenses: 2000, yourExpenses: 1000 },
    { month: '2026-10', categoryId: groceries.id, expenses: 13_000, yourExpenses: 8000 },
    { month: '2026-10', categoryId: eatingOut.id, expenses: 6000, yourExpenses: 3000 },
    { month: '2026-10', categoryId: null, expenses: 1000, yourExpenses: 500 },
  ],
};

const base = `/api/households/${testHousehold.id}`;

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));

function fakeApi() {
  // Distinct ranges asked for (test queries go stale at once, so a range can be refetched).
  const ranges = new Set<string>();
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () => HttpResponse.json({ household: householdDetail() })),
    mock.get(`${base}/categories`, () => HttpResponse.json({ categories: [groceries, eatingOut] })),
    // The fixture's months, for whatever range the page asks for.
    mock.get(`${base}/reports`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const from = params.get('from') ?? '';
      const to = params.get('to') ?? '';
      ranges.add(`${from}..${to}`);
      const inRange = (month: string) => month >= from && month <= to;
      return HttpResponse.json({
        report: {
          from,
          to,
          currency: 'HUF',
          months: monthsBetween(from, to).map(
            (month) => report.months.find((m) => m.month === month) ?? empty(month),
          ),
          categories: report.categories.filter((row) => inRange(row.month)),
        },
      });
    }),
  );
  return { ranges };
}

const page = `/h/${testHousehold.id}/reports?to=2026-10`;

/** The rows of the category list as text, largest first. */
async function categoryRows() {
  const list = await screen.findByRole('list', { name: /^Spending by category in/ });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

describe('reports page', () => {
  // The page and Recharts load lazily; the first render would spend most of its time on that.
  beforeAll(async () => {
    await import('recharts');
  }, 30_000);

  it('shows six months as a table and the latest month by category', async () => {
    const api = fakeApi();
    renderRoute(page);

    const table = await screen.findByRole('table', { name: 'Spent and income per month' });
    const october = within(table).getByRole('row', { name: /October 2026/ });
    expect(october).toHaveTextContent(money('20 000 Ft'));
    expect(october).toHaveTextContent(money('40 000 Ft'));
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect([...api.ranges]).toEqual(['2026-05..2026-10']);

    expect(screen.getByRole('heading', { name: 'By category · October 2026' })).toBeVisible();
    expect(await categoryRows()).toEqual([
      expect.stringMatching(/^Groceries13\s000\sFt · 65%$/),
      expect.stringMatching(/^Eating out6000\sFt · 30%$/),
      expect.stringMatching(/^No category1000\sFt · 5%$/),
    ]);
  });

  it('switches to the viewer’s share', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    await categoryRows();

    const view = screen.getByRole('group', { name: 'Whose spending' });
    await user.click(within(view).getByRole('button', { name: 'Your share' }));

    await waitFor(async () => {
      expect(await categoryRows()).toEqual([
        expect.stringMatching(/^Groceries8000\sFt · 70%$/),
        expect.stringMatching(/^Eating out3000\sFt · 26%$/),
        expect.stringMatching(/^No category500\sFt · 4%$/),
      ]);
    });
    const table = screen.getByRole('table', { name: 'Spent and income per month' });
    expect(within(table).getByRole('row', { name: /October 2026/ })).toHaveTextContent(
      money('11 500 Ft'),
    );
  });

  it('steps to the previous month within the same six months', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    await categoryRows();

    await user.click(screen.getByRole('link', { name: 'Previous month' }));
    expect(
      await screen.findByRole('heading', { name: 'By category · September 2026' }),
    ).toBeVisible();
    expect(await categoryRows()).toEqual([expect.stringMatching(/^Groceries2000\sFt · 100%$/)]);
    // Same six months: no other range.
    expect([...api.ranges]).toEqual(['2026-05..2026-10']);

    await user.click(screen.getByRole('link', { name: 'Previous month' }));
    expect(await screen.findByText('No spending in August 2026.')).toBeVisible();
  });

  it('says when the six months have no transactions', async () => {
    fakeApi();
    server.use(
      mock.get(`${base}/reports`, () =>
        HttpResponse.json({
          report: { ...report, months: report.months.map((m) => empty(m.month)), categories: [] },
        }),
      ),
    );
    renderRoute(page);
    expect(await screen.findByText('No transactions in these months.')).toBeVisible();
    expect(screen.getByText('No spending in October 2026.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('adds up a year by category and steps by year', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    await categoryRows();

    const period = screen.getByRole('group', { name: 'Period' });
    await user.click(within(period).getByRole('button', { name: 'Year' }));
    expect(await screen.findByRole('heading', { name: /^By category · 2026/ })).toBeVisible();
    expect(await categoryRows()).toEqual([
      expect.stringMatching(/^Groceries15\s000\sFt · 68%$/),
      expect.stringMatching(/^Eating out6000\sFt · 27%$/),
      expect.stringMatching(/^No category1000\sFt · 5%$/),
    ]);
    const table = screen.getByRole('table', { name: 'Spent and income per month' });
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    // No month arrows on the category card in a year.
    expect(screen.queryByRole('link', { name: 'Previous month' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Previous year' }));
    expect(await screen.findByText('No spending in 2025.')).toBeVisible();
    expect([...api.ranges]).toEqual(['2026-05..2026-10', '2026-01..2026-12', '2025-01..2025-12']);
  });

  it('moves to the six months before', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);
    await categoryRows();

    await user.click(screen.getByRole('link', { name: 'Earlier months' }));
    await waitFor(() => {
      expect([...api.ranges]).toEqual(['2026-05..2026-10', '2025-11..2026-04']);
    });
  });
});
