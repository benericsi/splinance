import type { Debt, HouseholdMember, Settlement } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  householdDetail,
  testHousehold,
  testUser,
} from '../../../test/utils';

const member = (userId: string, displayName: string): HouseholdMember => ({
  userId,
  displayName,
  role: 'member',
  joinedAt: '2026-10-09T16:06:43.492Z',
});

const bela = member('01a1216a-b248-781c-9cc6-cd68276fcdfc', 'Bela');
const cili = member('01a1216a-b248-781c-9cc6-cd68276fcdfd', 'Cili');
const anna = { userId: testUser.id, displayName: testUser.displayName };
const person = ({ userId, displayName }: HouseholdMember) => ({ userId, displayName });

const payment: Settlement = {
  id: '01a1250a-8673-7669-9f80-8f4006ca5e01',
  from: person(bela),
  to: anna,
  amount: 4500,
  currency: 'HUF',
  settledOn: '2026-10-01',
  note: 'cash',
  createdBy: person(bela),
  createdAt: '2026-10-01T10:00:00.000Z',
};

const base = `/api/households/${testHousehold.id}`;

/** An in-memory API: Anna (logged in, owner), Bela and Cili. */
function fakeApi({
  debts = [{ from: person(bela), to: anna, amount: 12_000 }],
  settlements = [] as Settlement[],
}: { debts?: Debt[]; settlements?: Settlement[] } = {}) {
  const state = {
    debts,
    settlements,
    failNextPost: false,
    writes: [] as { method: string; path: string; body: unknown }[],
  };
  const record = async (request: Request) => {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => undefined);
    state.writes.push({ method: request.method, path: new URL(request.url).pathname, body });
  };

  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () =>
      HttpResponse.json({
        household: householdDetail(testHousehold, [
          { ...anna, role: 'owner', joinedAt: testHousehold.createdAt },
          bela,
          cili,
        ]),
      }),
    ),
    mock.get(`${base}/balances`, () =>
      HttpResponse.json({ balances: { currency: 'HUF', debts: state.debts } }),
    ),
    mock.get(`${base}/settlements`, () =>
      HttpResponse.json({ settlements: state.settlements, nextCursor: null }),
    ),
    mock.post(`${base}/settlements`, async ({ request }) => {
      await record(request);
      if (state.failNextPost) {
        state.failNextPost = false;
        return HttpResponse.json(apiError('FORBIDDEN', 'Not your payment'), { status: 403 });
      }
      // Bela paid 10 000 of the 12 000 he owed.
      state.debts = [{ from: person(bela), to: anna, amount: 2000 }];
      return HttpResponse.json(
        { settlement: { ...payment, amount: 10_000, settledOn: '2026-10-12' } },
        { status: 201 },
      );
    }),
    mock.delete(`${base}/settlements/:id`, async ({ request }) => {
      await record(request);
      state.settlements = [];
      return new HttpResponse(null, { status: 204 });
    }),
    mock.post(`${base}/settlements/:id/restore`, async ({ request }) => {
      await record(request);
      state.settlements = [payment];
      return HttpResponse.json({ settlement: payment });
    }),
  );
  return state;
}

const overview = `/h/${testHousehold.id}`;

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));

afterEach(() => {
  localStorage.clear();
});

describe('balances on the overview', () => {
  it('shows the largest debt big, the rest of the household below', async () => {
    fakeApi({
      debts: [
        { from: person(bela), to: anna, amount: 12_000 },
        { from: anna, to: person(cili), amount: 3000 },
        { from: person(cili), to: person(bela), amount: 1500 },
      ],
    });
    renderRoute(overview);

    expect(await screen.findByText('Bela owes you')).toBeVisible();
    // MoneyFlow (mocked in tests) renders the digits and a screen reader copy.
    expect(screen.getAllByText(money('12 000 Ft'))[0]).toBeInTheDocument();

    const rest = screen
      .getByRole('heading', { name: 'Also in Otthon' })
      .closest('[data-slot=card]');
    if (!(rest instanceof HTMLElement)) throw new Error('No card');
    expect(within(rest).getByText('You owe Cili')).toBeVisible();
    expect(within(rest).getByText('Cili owes Bela')).toBeVisible();
    // Only debts the viewer is part of can be settled from here.
    expect(within(rest).getAllByRole('link', { name: 'Settle up' })).toHaveLength(1);
  });

  it('says when nobody owes anybody', async () => {
    fakeApi({ debts: [] });
    renderRoute(overview);
    expect(await screen.findByText("You're all square")).toBeVisible();
    expect(screen.getByText('Nobody owes anybody in Otthon.')).toBeVisible();
  });

  it('records a partial payment prefilled from the debt', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(overview);

    await user.click(await screen.findByRole('link', { name: 'Settle up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settle up' });
    expect(within(dialog).getByRole('button', { name: 'Bela paid you' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByText(money('Bela owes you 12 000 Ft'))).toBeVisible();
    const amount = within(dialog).getByLabelText<HTMLInputElement>('Amount');
    expect(amount.value).toMatch(money('12 000'));
    expect(within(dialog).getByText("You're all square after this")).toBeVisible();

    await user.clear(amount);
    await user.type(amount, '10000');
    expect(
      within(dialog).getByText(money('After this, Bela still owes you 2000 Ft')),
    ).toBeVisible();

    await user.type(within(dialog).getByLabelText('Note'), 'Revolut');
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText('Payment recorded')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(api.writes).toEqual([
      {
        method: 'POST',
        path: `${base}/settlements`,
        body: {
          fromUserId: bela.userId,
          toUserId: anna.userId,
          amount: 10_000,
          settledOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
          note: 'Revolut',
        },
      },
    ]);
    // The balance refreshes after the write.
    expect((await screen.findAllByText(money('2000 Ft')))[0]).toBeInTheDocument();
  });

  it('switches who paid and the person to settle with', async () => {
    fakeApi({
      debts: [
        { from: person(bela), to: anna, amount: 12_000 },
        { from: anna, to: person(cili), amount: 3000 },
      ],
    });
    const user = userEvent.setup();
    renderRoute(`${overview}/settle?with=${cili.userId}`);

    const dialog = await screen.findByRole('dialog', { name: 'Settle up' });
    expect(within(dialog).getByRole('button', { name: 'You paid Cili' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('3000');

    await user.click(within(dialog).getByRole('button', { name: 'Bela' }));
    expect(within(dialog).getByRole('button', { name: 'Bela paid you' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByLabelText<HTMLInputElement>('Amount').value).toMatch(
      money('12 000'),
    );

    await user.click(within(dialog).getByRole('button', { name: 'You paid Bela' }));
    expect(within(dialog).getByText(money('After this, Bela owes you 24 000 Ft'))).toBeVisible();
  });

  it('shows a refused payment in the dialog', async () => {
    const api = fakeApi();
    api.failNextPost = true;
    const user = userEvent.setup();
    renderRoute(`${overview}/settle`);

    const dialog = await screen.findByRole('dialog', { name: 'Settle up' });
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    expect(await within(dialog).findByText('Not your payment')).toBeVisible();
  });

  it('deletes a payment and undoes it from the toast', async () => {
    const api = fakeApi({ settlements: [payment] });
    const user = userEvent.setup();
    renderRoute(overview);

    const list = (await screen.findByRole('heading', { name: 'Recent settlements' })).closest(
      '[data-slot=card]',
    );
    if (!(list instanceof HTMLElement)) throw new Error('No card');
    expect(within(list).getByText('Bela paid you')).toBeVisible();
    expect(within(list).getByText(/cash/)).toBeVisible();

    await user.click(within(list).getByRole('button', { name: 'Payment actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(await screen.findByText('Payment deleted')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      expect(api.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
        `DELETE ${base}/settlements/${payment.id}`,
        `POST ${base}/settlements/${payment.id}/restore`,
      ]);
    });
    expect(await screen.findByText('Bela paid you')).toBeVisible();
  });
});
