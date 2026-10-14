import type { Budget, Category } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, householdDetail, testHousehold } from '../../../test/utils';
import { currentMonth } from '../transactions/dates';
import { budgetNote, budgetStatus } from './status';

const category = (id: string, name: string, overrides: Partial<Category> = {}): Category => ({
  id,
  name,
  kind: 'expense',
  icon: 'tag',
  color: 'green',
  archivedAt: null,
  ...overrides,
});

const groceries = category('01a12509-0f61-75bc-b406-130108780401', 'Groceries');
const eatingOut = category('01a12509-0f61-75bc-b406-130108780402', 'Eating out');
const transport = category('01a12509-0f61-75bc-b406-130108780403', 'Transport');
const salary = category('01a12509-0f61-75bc-b406-130108780404', 'Salary', { kind: 'income' });

const october: Budget[] = [
  { categoryId: groceries.id, amount: 80_000, since: '2026-09', spent: 62_400 },
  { categoryId: eatingOut.id, amount: 30_000, since: '2026-09', spent: 27_000 },
  { categoryId: transport.id, amount: 25_000, since: '2026-10', spent: 29_000 },
];

const base = `/api/households/${testHousehold.id}`;

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));

function fakeApi(budgets: Budget[] = october) {
  const state = { puts: [] as { categoryId: string; body: unknown }[], months: [] as string[] };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () => HttpResponse.json({ household: householdDetail() })),
    mock.get(`${base}/categories`, () =>
      HttpResponse.json({ categories: [groceries, eatingOut, transport, salary] }),
    ),
    mock.get(`${base}/budgets`, ({ request }) => {
      const month = new URL(request.url).searchParams.get('month') ?? '';
      state.months.push(month);
      return HttpResponse.json({
        budgets: { month, currency: 'HUF', budgets: month === '2026-10' ? budgets : [] },
      });
    }),
    mock.put(`${base}/budgets/:categoryId`, async ({ request, params }) => {
      state.puts.push({ categoryId: String(params.categoryId), body: await request.json() });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

afterEach(() => {
  localStorage.clear();
});

describe('budget status', () => {
  it('is near from 80% and over past the amount, in words', () => {
    const plain = (text: string) => text.replace(/\s/g, ' ');
    expect(budgetStatus({ amount: 100, spent: 79 })).toBe('ok');
    expect(budgetStatus({ amount: 100, spent: 80 })).toBe('near');
    expect(budgetStatus({ amount: 100, spent: 100 })).toBe('near');
    expect(budgetStatus({ amount: 100, spent: 101 })).toBe('over');
    expect(plain(budgetNote({ amount: 80_000, spent: 62_400 }, 'HUF'))).toBe('17 600 Ft left');
    expect(plain(budgetNote({ amount: 30_000, spent: 27_000 }, 'HUF'))).toBe('3000 Ft left · 90%');
    expect(plain(budgetNote({ amount: 25_000, spent: 29_000 }, 'HUF'))).toBe('Over by 4000 Ft');
  });
});

describe('budgets page', () => {
  it('shows the month with totals and a row per budget', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/budgets?month=2026-10`);

    expect(await screen.findByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    const total = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? '';
    expect(total('Budgeted')).toMatch(money('135 000 Ft'));
    expect(total('Spent')).toMatch(money('118 400 Ft'));
    expect(total('Left')).toMatch(money('16 600 Ft'));

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Eating out.*3000\sFt left · 90%$/),
      expect.stringMatching(/^Groceries.*17\s600\sFt left$/),
      expect.stringMatching(/^Transport.*Over by 4000\sFt$/),
    ]);
  });

  it('invites to set a budget when a month has none', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}/budgets?month=2026-10`);

    await user.click(await screen.findByRole('link', { name: 'Next month' }));
    expect(
      await screen.findByRole('heading', { name: 'No budgets for November 2026' }),
    ).toBeVisible();
    expect(api.months).toContain('2026-11');
  });

  it('sets a budget from the month on screen', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}/budgets?month=2026-10`);

    await user.click(await screen.findByRole('link', { name: 'Set budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set budget' });
    expect(
      within(dialog).getByText('From October 2026 on. Earlier months keep theirs.'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Choose a category')).toBeVisible();

    await user.click(within(dialog).getByLabelText('Category'));
    // Income categories do not get budgets.
    expect(screen.queryByRole('option', { name: 'Salary' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Groceries' }));
    // It had a budget: its amount is the starting point.
    expect(within(dialog).getByLabelText<HTMLInputElement>('Every month').value).toMatch(
      money('80 000'),
    );
    const amount = within(dialog).getByLabelText('Every month');
    await user.clear(amount);
    await user.type(amount, '90000');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Budget saved')).toBeVisible();
    expect(api.puts).toEqual([
      { categoryId: groceries.id, body: { amount: 90_000, from: '2026-10' } },
    ]);
  });

  it('opens a row to change or remove its budget', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}/budgets?month=2026-10`);

    await user.click(await screen.findByRole('link', { name: /^Transport/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Change budget' });
    expect(within(dialog).getByLabelText<HTMLInputElement>('Every month').value).toMatch(
      money('25 000'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove budget' }));

    expect(await screen.findByText('Budget removed')).toBeVisible();
    expect(api.puts).toEqual([
      { categoryId: transport.id, body: { amount: null, from: '2026-10' } },
    ]);
  });
});

describe('budgets on the overview', () => {
  it('lists only the budgets near or over their limit, most used first', async () => {
    const month = currentMonth();
    fakeApi();
    // The overview asks for the current month; answer it with October's numbers.
    server.use(
      mock.get(`${base}/budgets`, () =>
        HttpResponse.json({ budgets: { month, currency: 'HUF', budgets: october } }),
      ),
    );
    renderRoute(`/h/${testHousehold.id}`);

    const card = (await screen.findByRole('heading', { name: 'Budgets this month' })).closest(
      '[data-slot=card]',
    );
    if (!(card instanceof HTMLElement)) throw new Error('No card');
    await waitFor(() => {
      expect(
        within(card)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringMatching(/^Transport.*Over by/),
        expect.stringMatching(/^Eating out.*90%/),
      ]);
    });
    expect(within(card).getByRole('link', { name: 'All budgets' })).toBeVisible();
  });
});
