import type { Category, HouseholdMember, Transaction } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  getField,
  householdDetail,
  testHousehold,
  testUser,
} from '../../../test/utils';

const bela: HouseholdMember = {
  userId: '01a1216a-b248-781c-9cc6-cd68276fcdfc',
  displayName: 'Bela',
  role: 'member',
  joinedAt: '2026-10-09T16:06:43.492Z',
};

const eatingOut: Category = {
  id: '01a12509-0f61-790b-b827-659280707924',
  name: 'Eating out',
  kind: 'expense',
  icon: 'utensils',
  color: 'orange',
  archivedAt: null,
};

const salary: Category = {
  ...eatingOut,
  id: '01a12509-0f61-790b-b827-659280707925',
  name: 'Salary',
  kind: 'income',
  icon: 'briefcase',
};

const anna = { userId: testUser.id, displayName: testUser.displayName };
const belaPerson = { userId: bela.userId, displayName: bela.displayName };

const pizza: Transaction = {
  id: '01a1250a-8673-7669-9f80-8f4006ca5ece',
  kind: 'expense',
  visibility: 'shared',
  amount: 12_000,
  currency: 'HUF',
  occurredOn: '2026-10-10',
  description: 'Pizza night',
  categoryId: eatingOut.id,
  paidBy: anna,
  createdBy: anna,
  split: {
    method: 'percentage',
    shares: [
      { ...anna, amount: 7200, basisPoints: 6000 },
      { ...belaPerson, amount: 4800, basisPoints: 4000 },
    ],
  },
  version: 1,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};

const haircut: Transaction = {
  ...pizza,
  id: '01a1250a-8673-7669-9f80-8f4006ca5ecf',
  visibility: 'private',
  amount: 2500,
  occurredOn: '2026-10-09',
  description: 'Haircut',
  categoryId: null,
  split: null,
};

const base = `/api/households/${testHousehold.id}/transactions`;
const page = `/h/${testHousehold.id}/transactions?month=2026-10`;

/** An in-memory API for one household with Anna (logged in) and Bela. */
function fakeApi() {
  const state = {
    transactions: [pizza, haircut],
    conflictOnNextPut: false,
    requests: [] as { method: string; path: string; body: unknown }[],
  };
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => undefined);
    state.requests.push({ method: request.method, path: url.pathname + url.search, body });
  };

  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(`/api/households/${testHousehold.id}`, () =>
      HttpResponse.json({
        household: householdDetail(testHousehold, [
          {
            userId: testUser.id,
            displayName: 'Anna',
            role: 'owner',
            joinedAt: testHousehold.createdAt,
          },
          bela,
        ]),
      }),
    ),
    mock.get(`/api/households/${testHousehold.id}/categories`, () =>
      HttpResponse.json({ categories: [eatingOut, salary] }),
    ),
    mock.get(`${base}/summary`, ({ request }) => {
      const month = new URL(request.url).searchParams.get('month') ?? '';
      const expenses = month === '2026-10' ? 14_500 : 0;
      return HttpResponse.json({
        summary: { month, currency: 'HUF', expenses, income: 0, yourExpenses: expenses ? 9700 : 0 },
      });
    }),
    mock.get(base, async ({ request }) => {
      await record(request);
      const month = new URL(request.url).searchParams.get('month');
      const transactions = state.transactions.filter((t) => t.occurredOn.startsWith(month ?? ''));
      return HttpResponse.json({ transactions, nextCursor: null });
    }),
    mock.get(`${base}/:id`, ({ params }) => {
      const found = state.transactions.find((t) => t.id === params.id);
      return found
        ? HttpResponse.json({ transaction: found })
        : HttpResponse.json(apiError('TRANSACTION_NOT_FOUND'), { status: 404 });
    }),
    mock.post(base, async ({ request }) => {
      await record(request);
      return HttpResponse.json(
        { transaction: { ...pizza, id: '01a1250a-0000-7000-8000-000000000001' } },
        { status: 201 },
      );
    }),
    mock.put(`${base}/:id`, async ({ request }) => {
      await record(request);
      if (state.conflictOnNextPut) {
        state.conflictOnNextPut = false;
        // Someone else saved first: the server now holds version 2.
        state.transactions = state.transactions.map((t) =>
          t.id === pizza.id ? { ...t, description: 'Pizza and drinks', version: 2 } : t,
        );
        return HttpResponse.json(apiError('VERSION_CONFLICT', 'Someone else changed this'), {
          status: 409,
        });
      }
      return HttpResponse.json({ transaction: { ...pizza, version: 2 } });
    }),
    mock.delete(`${base}/:id`, async ({ request, params }) => {
      await record(request);
      state.transactions = state.transactions.filter((t) => t.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    mock.post(`${base}/:id/restore`, async ({ request }) => {
      await record(request);
      state.transactions = [pizza, haircut];
      return HttpResponse.json({ transaction: pizza });
    }),
  );
  return state;
}

const writes = (state: ReturnType<typeof fakeApi>) =>
  state.requests.filter((r) => r.method !== 'GET');

afterEach(() => {
  localStorage.clear();
});

describe('transactions list', () => {
  it('groups by day with totals, shares and private markers', async () => {
    fakeApi();
    renderRoute(page);

    expect(await screen.findByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    const pizzaDay = screen.getByRole('region', { name: /10 Oct/ });
    expect(within(pizzaDay).getByText('Pizza night')).toBeVisible();
    expect(within(pizzaDay).getByText('Eating out · You paid · 60 / 40 %')).toBeVisible();
    expect(within(pizzaDay).getByText(/you 7200/)).toBeVisible();

    const haircutDay = screen.getByRole('region', { name: /9 Oct/ });
    expect(within(haircutDay).getByLabelText('Private')).toBeInTheDocument();
    expect(within(haircutDay).getByText('Just you')).toBeVisible();
  });

  it('steps to another month through the URL', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    const router = renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Previous month' }));

    expect(
      await screen.findByRole('heading', { name: 'Add your first transaction' }),
    ).toBeVisible();
    expect(router.state.location.search).toEqual({ month: '2026-09' });
    expect(api.requests.at(-1)?.path).toBe(`${base}?month=2026-09`);
  });
});

describe('adding a transaction', () => {
  it('sends an equal split between everyone by default', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    await user.type(within(dialog).getByLabelText('Amount'), '12 000');
    await user.type(getField('Description'), 'Pizza night');
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'Eating out');
    expect(
      within(dialog).getByText('Paid by you · split equally between you and Bela'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(writes(api)).toEqual([
      {
        method: 'POST',
        path: base,
        body: {
          visibility: 'shared',
          kind: 'expense',
          amount: 12_000,
          occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
          description: 'Pizza night',
          categoryId: eatingOut.id,
          paidBy: testUser.id,
          split: { method: 'equal', userIds: [testUser.id, bela.userId] },
        },
      },
    ]);
  });

  it('checks a percentage split before sending anything', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    await user.type(within(dialog).getByLabelText('Amount'), '1000');
    await user.type(getField('Description'), 'Wine');
    await user.click(within(dialog).getByRole('button', { name: 'Change' }));
    await user.click(within(dialog).getByRole('button', { name: 'Percent' }));

    // Prefilled with an even split.
    const annaPercent = within(dialog).getByLabelText('Percent for You');
    expect(annaPercent).toHaveValue('50');
    expect(within(dialog).getAllByText('500 Ft')).toHaveLength(2);

    await user.clear(annaPercent);
    await user.type(annaPercent, '40');
    expect(within(dialog).getByText('10 % left to assign')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Percentages must add up to 100%',
    );
    expect(writes(api)).toEqual([]);
  });

  it('sends a private transaction without payer or split', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Income' }));
    await user.type(within(dialog).getByLabelText('Amount'), '420000');
    await user.type(getField('Description'), 'Salary');
    await user.click(within(dialog).getByRole('button', { name: 'Just me' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(writes(api)).toHaveLength(1);
    });
    expect(writes(api)[0]?.body).toEqual({
      visibility: 'private',
      kind: 'income',
      amount: 420_000,
      occurredOn: expect.any(String) as unknown,
      description: 'Salary',
      categoryId: null,
    });
  });

  it('groups digits while typing and keeps the caret in place', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    const amount = within(dialog).getByLabelText<HTMLInputElement>('Amount');

    // Letters and (for forints) separators never get in; digits are grouped as typed.
    await user.type(amount, '1x00.000abc000');
    expect(amount).toHaveValue('100\u00a0000\u00a0000');

    // Inserting after the first digit regroups, and the caret stays behind the new digit.
    amount.setSelectionRange(1, 1);
    await user.type(amount, '5', { initialSelectionStart: 1, initialSelectionEnd: 1 });
    expect(amount).toHaveValue('1\u00a0500\u00a0000\u00a0000');
    expect(amount.selectionStart).toBe(3); // "1 5|00 000 000"
  });

  it('names the limit when an amount is too large', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    await user.type(within(dialog).getByLabelText('Amount'), '5000000000000');
    await user.type(getField('Description'), 'Lidl');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      await within(dialog).findByText(/^Amount can be at most 1\s000\s000\s000\s000 Ft$/),
    ).toBeVisible();
    expect(writes(api)).toEqual([]);
  });

  it('explains a missing amount and description', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Enter an amount')).toBeVisible();
    expect(within(dialog).getByText('Description is required')).toBeVisible();
  });
});

describe('editing a transaction', () => {
  it('opens with the saved split and sends the version it edited', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: /Pizza night/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    expect(within(dialog).getByLabelText('Percent for Bela')).toHaveValue('40');
    await user.clear(getField('Description'));
    await user.type(getField('Description'), 'Pizza');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(writes(api)).toHaveLength(1);
    });
    expect(writes(api)[0]).toMatchObject({
      method: 'PUT',
      path: `${base}/${pizza.id}`,
      body: {
        description: 'Pizza',
        version: 1,
        split: {
          method: 'percentage',
          shares: [
            { userId: testUser.id, basisPoints: 6000 },
            { userId: bela.userId, basisPoints: 4000 },
          ],
        },
      },
    });
  });

  it('offers the newer version after a conflict instead of overwriting it', async () => {
    const api = fakeApi();
    api.conflictOnNextPut = true;
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: /Pizza night/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText(/Someone else saved a change/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Load latest version' }));

    await waitFor(() => {
      expect(getField('Description')).toHaveValue('Pizza and drinks');
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(writes(api).map((r) => (r.body as { version: number }).version)).toEqual([1, 2]);
    });
  });

  it('deletes and undoes from the toast', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: /Pizza night/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(writes(api).map((r) => `${r.method} ${r.path}`)).toEqual([
        `DELETE ${base}/${pizza.id}`,
        `POST ${base}/${pizza.id}/restore`,
      ]);
    });
    expect(await screen.findByText('Pizza night')).toBeVisible();
  });
});
