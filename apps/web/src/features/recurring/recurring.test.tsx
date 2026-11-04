import type {
  Category,
  RecurringList,
  RecurringSeries,
  RecurringSuggestion,
  Transaction,
} from '@splinance/shared';
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
import { toIsoDate } from '../transactions/dates';
import { seriesForRow } from './match';

const base = `/api/households/${testHousehold.id}`;
const page = `/h/${testHousehold.id}/recurring`;

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));

/** A date `days` from today (negative: before), as the page computes "today". */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** A month before `date`, same day (good enough for days up to the 28th the tests use). */
function monthBefore(date: string): string {
  const [year = 2026, month = 1, day = 1] = date.split('-').map(Number);
  return toIsoDate(new Date(year, month - 2, day));
}

const entertainment: Category = {
  id: '01a12509-0f61-75bc-b406-130108780407',
  name: 'Entertainment',
  kind: 'expense',
  icon: 'film',
  color: 'blue',
  archivedAt: null,
};

function series(overrides: Partial<RecurringSeries>): RecurringSeries {
  return {
    id: '01a12509-0f61-75bc-b406-1301087805a1',
    source: 'detected',
    createdBy: testUser.id,
    name: 'Netflix',
    pattern: 'netflix',
    cadence: 'monthly',
    amount: 4_490,
    amountVaries: false,
    anchorOn: '2026-01-07',
    startsOn: null,
    categoryId: entertainment.id,
    scope: 'shared',
    remind: true,
    payments: [],
    paymentCount: 0,
    lastPaidOn: null,
    latestAmount: 4_490,
    previousAmount: null,
    share: null,
    monthlyAmount: 4_490,
    ...overrides,
  };
}

/** Next payment in 3 days, price up from 4 490 to 4 990, half of it the viewer's. */
const netflixLast = monthBefore(daysFromToday(3));
const netflix = series({
  anchorOn: netflixLast,
  lastPaidOn: netflixLast,
  paymentCount: 7,
  payments: [
    {
      transactionId: '01a12509-0f61-75bc-b406-1301087806a1',
      occurredOn: netflixLast,
      amount: 4_990,
      imported: true,
    },
  ],
  latestAmount: 4_990,
  previousAmount: 4_490,
  share: 2_495,
  monthlyAmount: 4_990,
});

/** Stopped: the last payment four months ago. */
const gymLast = monthBefore(monthBefore(monthBefore(monthBefore(daysFromToday(-2)))));
const gym = series({
  id: '01a12509-0f61-75bc-b406-1301087805a2',
  source: 'manual',
  name: 'Gym membership',
  pattern: 'fitness park',
  amount: 14_900,
  anchorOn: gymLast,
  lastPaidOn: gymLast,
  paymentCount: 8,
  latestAmount: 14_900,
  previousAmount: 14_900,
  share: 7_450,
  monthlyAmount: 14_900,
  categoryId: null,
});

/** Private, next payment in 20 days. */
const phoneLast = monthBefore(daysFromToday(20));
const phone = series({
  id: '01a12509-0f61-75bc-b406-1301087805a3',
  name: 'Phone plan',
  pattern: 'yettel',
  scope: 'private',
  amount: 6_990,
  anchorOn: phoneLast,
  lastPaidOn: phoneLast,
  paymentCount: 12,
  latestAmount: 6_990,
  previousAmount: 6_990,
  monthlyAmount: 6_990,
  categoryId: null,
});

const spotify: RecurringSuggestion = {
  key: 'spotify',
  scope: 'shared',
  cadence: 'monthly',
  amount: 3_290,
  previousAmount: 3_290,
  amountVaries: false,
  firstOn: '2026-06-12',
  lastOn: daysFromToday(-5),
  occurrences: 6,
  description: 'Spotify Duo',
  categoryId: entertainment.id,
  monthlyAmount: 3_290,
  transactionIds: [],
};

function fakeApi(initial: Partial<RecurringList> = {}) {
  const list: RecurringList = {
    currency: 'HUF',
    series: [netflix, gym, phone],
    suggestions: [spotify],
    dismissed: [],
    ...initial,
  };
  const state = {
    list,
    requests: [] as { method: string; path: string; body: unknown }[],
  };
  const record = async (request: Request) => {
    state.requests.push({
      method: request.method,
      path: new URL(request.url).pathname.replace(base, ''),
      body: request.method === 'DELETE' ? null : await request.clone().json(),
    });
  };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () => HttpResponse.json({ household: householdDetail() })),
    mock.get(`${base}/categories`, () => HttpResponse.json({ categories: [entertainment] })),
    mock.get(`${base}/recurring`, () => HttpResponse.json({ recurring: state.list })),
  );
  return { state, record };
}

afterEach(() => {
  localStorage.clear();
});

describe('recurring page', () => {
  it('lists the series soonest first with what is due, changed or gone quiet', async () => {
    fakeApi();
    renderRoute(page);

    expect(await screen.findByRole('heading', { name: 'Recurring', level: 1 })).toBeVisible();
    const list = screen.getAllByRole('list')[0];
    if (!list) throw new Error('no list');
    const rows = within(list).getAllByRole('listitem');
    // Soonest first; the stopped gym last, asking whether it was cancelled.
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Netflix\+11%Monthly · due in 3 days4990\sFtyou 2495\sFt$/),
      expect.stringMatching(/^Phone planMonthly · due .*6990\sFt$/),
      expect.stringMatching(/^Gym membershipNo payment since .*\. Cancelled\?14\s900\sFt/),
    ]);
    expect(within(rows[1] as HTMLElement).getByLabelText('Only you')).toBeVisible();

    // The gym stopped, so it is not in the monthly total.
    // MoneyFlow renders the digits and a screen reader copy.
    expect(screen.getAllByText(money('11 980 Ft'))).not.toHaveLength(0);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Your share' }));
    expect(await screen.findAllByText(money('9485 Ft'))).not.toHaveLength(0);
  });

  it('confirms a suggestion and hides one with an undo', async () => {
    const { state, record } = fakeApi({ dismissed: [] });
    server.use(
      mock.post(`${base}/recurring/suggestions/confirm`, async ({ request }) => {
        await record(request);
        state.list = { ...state.list, suggestions: [] };
        return HttpResponse.json({ series: series({ name: 'Spotify Duo' }) }, { status: 201 });
      }),
      mock.post(`${base}/recurring/suggestions/dismiss`, async ({ request }) => {
        await record(request);
        state.list = {
          ...state.list,
          suggestions: [],
          dismissed: [
            { id: '01a12509-0f61-75bc-b406-1301087805b1', pattern: 'spotify', scope: 'shared' },
          ],
        };
        return new HttpResponse(null, { status: 204 });
      }),
      mock.delete(`${base}/recurring/:id`, async ({ request }) => {
        await record(request);
        state.list = { ...state.list, suggestions: [spotify], dismissed: [] };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute(page);

    const suggestions = await screen.findByRole('region', { name: 'Suggestions' });
    expect(within(suggestions).getByText(/Monthly · 6 payments since/)).toBeVisible();
    await user.click(
      within(suggestions).getByRole('button', { name: 'Spotify Duo is not recurring' }),
    );
    expect(await screen.findByText('Hidden from suggestions')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Hidden (1)' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(state.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        'POST /recurring/suggestions/dismiss',
        'DELETE /recurring/01a12509-0f61-75bc-b406-1301087805b1',
      ]);
    });

    await user.click(await screen.findByRole('button', { name: 'Confirm Spotify Duo' }));
    await waitFor(() => {
      expect(state.requests.at(-1)).toEqual({
        method: 'POST',
        path: '/recurring/suggestions/confirm',
        body: { scope: 'shared', key: 'spotify' },
      });
    });
    expect(state.requests[0]?.body).toEqual({ scope: 'shared', key: 'spotify' });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Suggestions' })).not.toBeInTheDocument();
    });
  });

  it('invites to add one when there is nothing yet', async () => {
    fakeApi({ series: [], suggestions: [] });
    renderRoute(page);
    expect(
      await screen.findByRole('heading', { name: 'Track subscriptions and bills' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a recurring payment' })).toBeVisible();
  });
});

describe('adding and editing', () => {
  it('fills the match text from the name, previews matches and adds it', async () => {
    const { state, record } = fakeApi({ series: [], suggestions: [] });
    server.use(
      mock.post(`${base}/recurring/preview`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({
          matches: 6,
          recent: [
            {
              transactionId: '01a12509-0f61-75bc-b406-1301087806b1',
              occurredOn: '2026-10-12',
              amount: 3_290,
              imported: true,
            },
          ],
        });
      }),
      mock.post(`${base}/recurring`, async ({ request }) => {
        await record(request);
        return HttpResponse.json(
          { series: series({ name: 'Spotify xyz', pattern: 'spotify', source: 'manual' }) },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRoute(`${page}/new`);

    const dialog = await screen.findByRole('dialog', { name: 'Add recurring payment' });
    await user.type(within(dialog).getByLabelText(/^Name/), 'Spotify xyz');
    expect(within(dialog).getByLabelText(/^Matches bank text containing/)).toHaveValue('spotify');
    await user.type(within(dialog).getByLabelText(/^Amount/), '3290');
    expect(await within(dialog).findByText('Matches 6 past payments')).toBeVisible();
    expect(state.requests.find((r) => r.path === '/recurring/preview')?.body).toEqual({
      pattern: 'spotify',
      amount: 3_290,
      amountVaries: false,
      scope: 'shared',
      startsOn: null,
    });

    await user.click(within(dialog).getByRole('button', { name: 'Only me' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Recurring payment added')).toBeVisible();
    expect(
      state.requests.find((r) => r.method === 'POST' && r.path === '/recurring')?.body,
    ).toEqual({
      name: 'Spotify xyz',
      pattern: 'spotify',
      cadence: 'monthly',
      amount: 3_290,
      amountVaries: false,
      anchorOn: toIsoDate(new Date()),
      startsOn: null,
      categoryId: null,
      scope: 'private',
      remind: true,
    });
  });

  it('shows a taken match text next to its field', async () => {
    fakeApi({ series: [], suggestions: [] });
    server.use(
      mock.post(`${base}/recurring/preview`, () => HttpResponse.json({ matches: 0, recent: [] })),
      mock.post(`${base}/recurring`, () =>
        HttpResponse.json(apiError('SERIES_PATTERN_TAKEN'), { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderRoute(`${page}/new`);

    const dialog = await screen.findByRole('dialog', { name: 'Add recurring payment' });
    await user.type(within(dialog).getByLabelText(/^Name/), 'Netflix');
    await user.type(within(dialog).getByLabelText(/^Amount/), '4490');
    expect(
      await within(dialog).findByText(
        /No past payments match yet\. Imports containing "netflix" will\./,
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(
      await within(dialog).findByText('A recurring payment matches this text already'),
    ).toBeVisible();
  });

  it('starts from a transaction ("Make recurring")', async () => {
    fakeApi({ series: [], suggestions: [] });
    const transaction = {
      id: '01a12509-0f61-75bc-b406-1301087806c1',
      kind: 'expense',
      visibility: 'private',
      amount: 6_990,
      currency: 'HUF',
      occurredOn: '2026-10-24',
      description: 'Phone plan',
      categoryId: null,
      counterparty: 'YETTEL HUNGARY 0412',
      importBatchId: '01a12509-0f61-75bc-b406-1301087806c2',
      paidBy: { userId: testUser.id, displayName: testUser.displayName },
      createdBy: { userId: testUser.id, displayName: testUser.displayName },
      split: null,
      version: 1,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    } satisfies Transaction;
    server.use(
      mock.get(`${base}/transactions/${transaction.id}`, () => HttpResponse.json({ transaction })),
      mock.post(`${base}/recurring/preview`, () => HttpResponse.json({ matches: 1, recent: [] })),
    );
    renderRoute(`${page}/new?from=${transaction.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Add recurring payment' });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Phone plan');
    expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue('6990');
    expect(within(dialog).getByLabelText(/^Next or last payment/)).toHaveValue('2026-10-24');
    expect(within(dialog).getByLabelText(/^Matches bank text containing/)).toHaveValue(
      'yettel hungary',
    );
    expect(within(dialog).getByRole('button', { name: 'Only me' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens a series with its payments, saves a change and stops tracking it', async () => {
    const { state, record } = fakeApi();
    server.use(
      mock.post(`${base}/recurring/preview`, () => HttpResponse.json({ matches: 7, recent: [] })),
      mock.patch(`${base}/recurring/:id`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ series: { ...netflix, name: 'Netflix Standard' } });
      }),
      mock.delete(`${base}/recurring/:id`, async ({ request }) => {
        await record(request);
        state.list = { ...state.list, series: [gym, phone] };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute(page);

    await user.click(await screen.findByRole('link', { name: /^Netflix/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Netflix' });
    expect(within(dialog).getByRole('heading', { name: 'Payments found (7)' })).toBeVisible();
    expect(within(dialog).getByText('Imported')).toBeVisible();

    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, 'Netflix Standard');
    // An existing series keeps its match text when renamed.
    expect(within(dialog).getByLabelText(/^Matches bank text containing/)).toHaveValue('netflix');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recurring payment saved')).toBeVisible();
    expect(state.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      path: `/recurring/${netflix.id}`,
      body: { name: 'Netflix Standard', pattern: 'netflix' },
    });

    await user.click(await screen.findByRole('link', { name: /^Gym membership/ }));
    const gymDialog = await screen.findByRole('dialog', { name: 'Gym membership' });
    await user.click(within(gymDialog).getByRole('button', { name: 'Stop tracking' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Stop tracking Gym membership?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByText('Stopped tracking Gym membership')).toBeVisible();
    expect(state.requests.at(-1)).toEqual({
      method: 'DELETE',
      path: `/recurring/${gym.id}`,
      body: null,
    });
  });
});

describe('overview', () => {
  it('shows what is coming up this week and the suggestions to review', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}`);

    const card = (await screen.findByText('Coming up')).closest('[data-slot="card"]');
    if (!(card instanceof HTMLElement)) throw new Error('no card');
    // Netflix in 3 days; the phone (20 days) and the stopped gym stay out.
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringMatching(/^NetflixDue in 3 days4990\sFt$/)]);
    expect(
      within(card).getByRole('link', { name: /1 possible recurring payment found/ }),
    ).toBeVisible();
  });
});

describe('seriesForRow (the import review label)', () => {
  const row = {
    kind: 'expense' as const,
    visibility: 'shared' as const,
    amount: 4_990,
    occurredOn: '2026-11-07',
    counterparty: 'NETFLIX.COM',
    description: 'Netflix',
  };

  it('finds the series a row will count for, by text, scope and amount', () => {
    expect(seriesForRow([netflix, phone], row, testUser.id)?.name).toBe('Netflix');
    expect(seriesForRow([netflix], { ...row, amount: 25_000 }, testUser.id)).toBeUndefined();
    // A shared series never takes a private row; the viewer's private one does.
    const mine = series({ id: 'mine', name: 'My Netflix', scope: 'private', latestAmount: 4_990 });
    expect(seriesForRow([netflix], { ...row, visibility: 'private' }, testUser.id)).toBeUndefined();
    expect(
      seriesForRow([netflix, mine], { ...row, visibility: 'private' }, testUser.id)?.name,
    ).toBe('My Netflix');
    // Shared first, like the API.
    expect(seriesForRow([mine, netflix], row, testUser.id)?.name).toBe('Netflix');
  });
});
