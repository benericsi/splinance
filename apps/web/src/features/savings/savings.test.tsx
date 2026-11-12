import type { Savings, SavingsEntry, SavingsGoal } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { localeStore } from '@/lib/locale';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  householdDetail,
  sentence,
  testHousehold,
  testUser,
} from '../../../test/utils';
import { paceText, stepText } from './describe';
import {
  arrangeGoals,
  barSegments,
  goalPace,
  goalProgress,
  memberFills,
  savingsTotals,
} from './view';

const ben = { userId: '01a12509-0f61-75bc-b406-1301087804b0', displayName: 'Ben' };
const anna = { userId: testUser.id, displayName: testUser.displayName };

let goalCount = 0;

function goal(name: string, overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  goalCount += 1;
  return {
    id: `01a12509-0f61-75bc-b406-1301087806${String(goalCount).padStart(2, '0')}`,
    name,
    targetAmount: 600_000,
    targetDate: null,
    currency: 'HUF',
    visibility: 'shared',
    createdBy: anna,
    archivedAt: null,
    balance: 0,
    contributions: [],
    pinned: false,
    createdAt: '2026-10-09T16:06:43.129Z',
    ...overrides,
  };
}

const trip = goal('Summer in Italy', {
  targetDate: '2027-07-01',
  balance: 420_000,
  contributions: [
    { ...anna, amount: 240_000 },
    { ...ben, amount: 180_000 },
  ],
});
const fund = goal('Emergency fund', {
  targetAmount: 2_000_000,
  visibility: 'private',
  balance: 1_150_000,
  contributions: [{ ...anna, amount: 1_150_000 }],
});
const pot = goal('Rainy day pot', {
  targetAmount: null,
  balance: 90_000,
  contributions: [{ ...ben, amount: 90_000 }],
});
const old = goal('Old sofa', {
  targetAmount: 100_000,
  balance: 100_000,
  archivedAt: '2026-09-01T10:00:00.000Z',
  contributions: [{ ...anna, amount: 100_000 }],
});

const base = `/api/households/${testHousehold.id}`;
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

function fakeApi(goals: SavingsGoal[] = [trip, fund, pot, old], setAside = 100_000) {
  const state = {
    goals: [...goals],
    posts: [] as unknown[],
    patches: [] as unknown[],
    entries: [] as { goalId: string; body: unknown }[],
    pins: [] as string[],
    removed: [] as string[],
    archived: [] as string[],
    history: [
      {
        id: '01a12509-0f61-75bc-b406-1301087805e1',
        user: anna,
        amount: 40_000,
        entryOn: '2026-11-03',
        note: null,
        createdAt: '2026-11-03T08:00:00.000Z',
      },
      {
        id: '01a12509-0f61-75bc-b406-1301087805e2',
        user: ben,
        amount: -55_000,
        entryOn: '2026-10-14',
        note: 'flights',
        createdAt: '2026-10-14T08:00:00.000Z',
      },
    ] as SavingsEntry[],
  };
  const change = (goalId: string, patch: Partial<SavingsGoal>) => {
    state.goals = state.goals.map((item) => (item.id === goalId ? { ...item, ...patch } : item));
  };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get(base, () =>
      HttpResponse.json({
        household: householdDetail(testHousehold, [
          { ...anna, role: 'owner', joinedAt: testHousehold.createdAt },
          { ...ben, role: 'member', joinedAt: testHousehold.createdAt },
        ]),
      }),
    ),
    mock.get(`${base}/savings`, () => {
      const savings: Savings = { currency: 'HUF', goals: state.goals, setAside };
      return HttpResponse.json({ savings });
    }),
    mock.post(`${base}/savings`, async ({ request }) => {
      const body = (await request.json()) as Partial<SavingsGoal>;
      state.posts.push(body);
      const created = goal(String(body.name), { ...body, id: crypto.randomUUID() });
      state.goals.push(created);
      return HttpResponse.json({ goal: created }, { status: 201 });
    }),
    mock.patch(`${base}/savings/:goalId`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<SavingsGoal>;
      state.patches.push(body);
      change(String(params.goalId), body);
      return HttpResponse.json({ goal: state.goals.find((item) => item.id === params.goalId) });
    }),
    mock.post(`${base}/savings/:goalId/archive`, ({ params }) => {
      state.archived.push(String(params.goalId));
      change(String(params.goalId), { archivedAt: '2026-11-12T10:00:00.000Z', pinned: false });
      return new HttpResponse(null, { status: 204 });
    }),
    mock.put(`${base}/savings/:goalId/pin`, ({ params }) => {
      if (state.goals.filter((item) => item.pinned).length >= 3) {
        return HttpResponse.json(apiError('SAVINGS_PIN_LIMIT'), { status: 409 });
      }
      state.pins.push(`pin ${String(params.goalId)}`);
      change(String(params.goalId), { pinned: true });
      return new HttpResponse(null, { status: 204 });
    }),
    mock.delete(`${base}/savings/:goalId/pin`, ({ params }) => {
      state.pins.push(`unpin ${String(params.goalId)}`);
      change(String(params.goalId), { pinned: false });
      return new HttpResponse(null, { status: 204 });
    }),
    mock.get(`${base}/savings/:goalId/entries`, () =>
      HttpResponse.json({ entries: state.history, nextCursor: null }),
    ),
    mock.post(`${base}/savings/:goalId/entries`, async ({ request, params }) => {
      const body = (await request.json()) as { amount: number; entryOn: string; note: null };
      state.entries.push({ goalId: String(params.goalId), body });
      const current = state.goals.find((item) => item.id === params.goalId);
      if (!current) return HttpResponse.json(apiError('SAVINGS_GOAL_NOT_FOUND'), { status: 404 });
      const entry: SavingsEntry = {
        id: crypto.randomUUID(),
        user: anna,
        ...body,
        createdAt: '2026-11-12T10:00:00.000Z',
      };
      state.history = [entry, ...state.history];
      change(current.id, { balance: current.balance + body.amount });
      return HttpResponse.json(
        { entry, goal: state.goals.find((item) => item.id === current.id) },
        { status: 201 },
      );
    }),
    mock.delete(`${base}/savings/:goalId/entries/:entryId`, ({ params }) => {
      state.removed.push(String(params.entryId));
      state.history = state.history.filter((entry) => entry.id !== params.entryId);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

describe('goal progress', () => {
  it('counts the milestones the balance has passed and what is missing to the next', () => {
    expect(goalProgress({ balance: 420_000, targetAmount: 600_000 })).toEqual({
      percent: 70,
      reached: false,
      toGo: 180_000,
      passed: [25, 50],
      next: { percent: 75, toGo: 30_000 },
    });
    expect(goalProgress({ balance: 0, targetAmount: 600_000 })).toMatchObject({
      percent: 0,
      passed: [],
      next: { percent: 25, toGo: 150_000 },
    });
    expect(goalProgress({ balance: 450_000, targetAmount: 600_000 })).toMatchObject({
      passed: [25, 50, 75],
      next: { percent: 100, toGo: 150_000 },
    });
  });

  it('is reached at the target and stays at 100% beyond it', () => {
    expect(goalProgress({ balance: 700_000, targetAmount: 600_000 })).toEqual({
      percent: 100,
      reached: true,
      toGo: 0,
      passed: [25, 50, 75, 100],
      next: null,
    });
  });

  it('never shows a milestone a forint early', () => {
    // A quarter of 1001 is 250.25: 250 is not there yet.
    expect(goalProgress({ balance: 250, targetAmount: 1001 }).passed).toEqual([]);
    expect(goalProgress({ balance: 251, targetAmount: 1001 }).passed).toEqual([25]);
  });

  it('has nothing to measure without a target', () => {
    expect(goalProgress({ balance: 90_000, targetAmount: null })).toEqual({
      percent: null,
      reached: false,
      toGo: 0,
      passed: [],
      next: null,
    });
  });
});

describe('goal pace', () => {
  const dated = (targetDate: string | null, balance = 420_000) => ({
    balance,
    targetAmount: 600_000,
    targetDate,
  });

  it('spreads the rest over the whole months left, rounded up', () => {
    // 12 Nov to 1 Jul: seven whole months.
    expect(goalPace(dated('2027-07-01'), '2026-11-12')).toEqual({
      kind: 'monthly',
      perMonth: 25_715,
      months: 7,
    });
    expect(goalPace(dated('2027-07-12'), '2026-11-12')).toMatchObject({ months: 8 });
  });

  it('counts at least one month, and says when the date has passed', () => {
    expect(goalPace(dated('2026-11-20'), '2026-11-12')).toEqual({
      kind: 'monthly',
      perMonth: 180_000,
      months: 1,
    });
    expect(goalPace(dated('2026-11-12'), '2026-11-12')).toMatchObject({ months: 1 });
    expect(goalPace(dated('2026-11-11'), '2026-11-12')).toEqual({ kind: 'overdue' });
  });

  it('says nothing without a date or a target, or once reached', () => {
    expect(goalPace(dated(null), '2026-11-12')).toBeNull();
    expect(goalPace(dated('2026-01-01', 600_000), '2026-11-12')).toBeNull();
    expect(
      goalPace({ balance: 1, targetAmount: null, targetDate: '2027-01-01' }, '2026-11-12'),
    ).toBeNull();
  });

  it('reads as a sentence', () => {
    expect(plain(stepText(trip))).toBe('30 000 Ft to 75%');
    expect(plain(stepText({ ...trip, balance: 450_000 }))).toBe('150 000 Ft to go');
    expect(stepText({ ...trip, balance: 600_000 })).toBe('Goal reached');
    expect(stepText(pot)).toBeNull();
    expect(plain(paceText(trip, '2026-11-12')?.text)).toBe(
      '25 715 Ft a month gets you there by 1 Jul 2027',
    );
    expect(paceText(trip, '2027-08-01')).toEqual({ text: 'The date has passed', overdue: true });
  });
});

describe('arranging goals', () => {
  it('leads with the pins and keeps closed goals apart', () => {
    const pinned = { ...pot, pinned: true };
    expect(arrangeGoals([trip, fund, pinned, old])).toEqual({
      featured: [pinned],
      rest: [trip, fund],
      closed: [old],
      auto: false,
    });
  });

  it('picks one while nothing is pinned: the nearest date, else the closest to done', () => {
    expect(arrangeGoals([fund, pot, trip, old])).toMatchObject({
      featured: [trip],
      rest: [fund, pot],
      auto: true,
    });
    // No dates: 57% beats 10%.
    const laptop = goal('Laptop', { balance: 60_000 });
    expect(arrangeGoals([laptop, fund]).featured).toEqual([fund]);
  });

  it('features nothing when no open goal has a target left to reach', () => {
    const done = goal('Done', { balance: 600_000 });
    expect(arrangeGoals([pot, done, old])).toEqual({
      featured: [],
      rest: [pot, done],
      closed: [old],
      auto: false,
    });
  });
});

describe('bars and totals', () => {
  it('splits the filled part by who put the money in', () => {
    const segments = barSegments(trip);
    expect(segments.map((segment) => segment.userId)).toEqual([anna.userId, ben.userId]);
    expect(segments[0]?.fraction).toBeCloseTo(0.4);
    expect(segments[1]?.fraction).toBeCloseTo(0.3);
    // No target: whatever is in it fills the bar.
    expect(barSegments(pot)).toMatchObject([{ userId: ben.userId, fraction: 1 }]);
    expect(barSegments(goal('Empty'))).toEqual([]);
  });

  it('gives no slice to someone who took out more than they put in', () => {
    const uneven = goal('Uneven', {
      balance: 100_000,
      contributions: [
        { ...anna, amount: 150_000 },
        { ...ben, amount: -50_000 },
      ],
    });
    const segments = barSegments(uneven);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.fraction).toBeCloseTo(100_000 / 600_000);
  });

  it('keeps one color per member, the viewer always the same', () => {
    const fills = memberFills([trip, pot], anna.userId);
    expect(fills.get(anna.userId)).toBe('bg-positive');
    expect(fills.get(ben.userId)).toBe('bg-brand-orange');
  });

  it('adds up open goals only', () => {
    expect(savingsTotals([trip, fund, pot, old], anna.userId)).toEqual({
      saved: 1_660_000,
      yours: 1_390_000,
    });
  });
});

describe('savings page', () => {
  it('features a goal with its milestones and lists the rest as tiles', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings`);

    expect(await screen.findByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();
    const total = (label: string) => plain(screen.getByText(label).nextElementSibling?.textContent);
    expect(total('Saved')).toContain('1 660 000 Ft');
    expect(total('Your part')).toContain('1 390 000 Ft');
    expect(total('Set aside this month')).toContain('100 000 Ft');

    // Nothing pinned: the goal with the nearest date is picked.
    const box = screen.getByRole('heading', { name: 'Summer in Italy', level: 2 }).closest('div');
    expect(box).not.toBeNull();
    expect(screen.getByText(sentence('30 000 Ft to 75%'))).toBeVisible();
    expect(screen.getByText('2 of 4 milestones reached')).toBeInTheDocument();
    expect(
      screen.getByText(sentence(/^25 \d{3} Ft a month gets you there by 1 Jul 2027$/)),
    ).toBeVisible();
    expect(screen.getByText('Picked for you. Pin a goal to keep it on top.')).toBeVisible();
    expect(document.querySelectorAll('[data-milestone="passed"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-milestone="ahead"]')).toHaveLength(1);

    const tiles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(tiles).toEqual(['Emergency fund', 'Rainy day pot']);
    expect(screen.getByText(sentence('of 2 000 000 Ft · 57%'))).toBeVisible();
    expect(screen.getByText('No target')).toBeVisible();

    // Closed goals wait behind a toggle.
    expect(screen.queryByText('Old sofa')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Closed goals (1)' }));
    expect(await screen.findByText('Old sofa')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pin Old sofa' })).not.toBeInTheDocument();
  });

  it('says "taken out" when more came out than went in', async () => {
    fakeApi([trip], -20_000);
    renderRoute(`/h/${testHousehold.id}/savings`);
    const label = await screen.findByText('Taken out this month');
    expect(plain(label.nextElementSibling?.textContent)).toContain('20 000 Ft');
  });

  it('offers a first goal while there is none', async () => {
    const api = fakeApi([]);
    renderRoute(`/h/${testHousehold.id}/savings`);

    expect(await screen.findByRole('heading', { name: 'Nothing set aside yet' })).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Create a goal' }));
    const dialog = await screen.findByRole('dialog', { name: 'New goal' });

    // A name is all a goal needs.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create goal' }));
    expect(await within(dialog).findByText('Name is required')).toBeVisible();
    expect(api.posts).toEqual([]);

    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'New laptop');
    await userEvent.type(within(dialog).getByLabelText('Target'), '450000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Just me' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create goal' }));

    await waitFor(() => {
      expect(api.posts).toEqual([
        { name: 'New laptop', targetAmount: 450_000, targetDate: null, visibility: 'private' },
      ]);
    });
    expect(await screen.findByText('Goal created')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'New laptop', level: 2 })).toBeVisible();
  });

  it('pins a goal to the top and lets it go again', async () => {
    const api = fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings`);

    const pin = await screen.findByRole('button', { name: 'Pin Rainy day pot' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pin);

    // The pin leads now, and the picked goal is a tile again.
    expect(await screen.findByRole('heading', { name: 'Rainy day pot', level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Summer in Italy', level: 3 })).toBeVisible();
    expect(screen.queryByText(/Picked for you/)).not.toBeInTheDocument();
    expect(api.pins).toEqual([`pin ${pot.id}`]);

    const unpin = screen.getByRole('button', { name: 'Unpin Rainy day pot' });
    expect(unpin).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(unpin);
    expect(await screen.findByRole('heading', { name: 'Summer in Italy', level: 2 })).toBeVisible();
    expect(api.pins).toEqual([`pin ${pot.id}`, `unpin ${pot.id}`]);
  });

  it('leaves the page as it was when a fourth pin is refused', async () => {
    // The refusal itself is said by the global mutation toast (lib/query-client.ts).
    const api = fakeApi([
      { ...trip, pinned: true },
      { ...fund, pinned: true },
      { ...pot, pinned: true },
      goal('Laptop'),
    ]);
    renderRoute(`/h/${testHousehold.id}/savings`);
    const pin = await screen.findByRole('button', { name: 'Pin Laptop' });
    await userEvent.click(pin);
    await waitFor(() => {
      expect(pin).toBeEnabled();
    });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    expect(api.pins).toEqual([]);
    expect(screen.getByRole('heading', { name: 'Laptop', level: 3 })).toBeVisible();
  });
});

describe('goal dialog', () => {
  it('shows the goal with its history and records money put in', async () => {
    const api = fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings/${trip.id}`);

    const dialog = await screen.findByRole('dialog', { name: 'Summer in Italy' });
    expect(within(dialog).getByText(/^Shared goal · by 1 Jul 2027$/)).toBeVisible();
    await within(dialog).findByText(/flights/);
    const history = within(dialog).getByRole('heading', { name: 'History' }).closest('section');
    const rows = within(history as HTMLElement).getAllByRole('listitem');
    expect(rows.map((row) => plain(row.textContent))).toEqual([
      expect.stringMatching(/^You.*\+40 000 Ft$/),
      expect.stringMatching(/^Ben · flights.*-55 000 Ft$/),
    ]);

    // Empty amount: asked for, nothing sent.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add money' }));
    expect(await within(dialog).findByText('Enter an amount')).toBeVisible();
    expect(api.entries).toEqual([]);

    await userEvent.type(within(dialog).getByLabelText('Amount'), '20000');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'bonus');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add money' }));

    await waitFor(() => {
      expect(api.entries).toHaveLength(1);
    });
    expect(api.entries[0]).toMatchObject({
      goalId: trip.id,
      body: { amount: 20_000, note: 'bonus' },
    });
    expect(await screen.findByText('Added to Summer in Italy')).toBeVisible();
    // The dialog stays for the next one, with the form empty again.
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('');
  });

  it('takes money out as a negative amount, never more than the goal holds', async () => {
    const api = fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings/${trip.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Summer in Italy' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Take out' }));
    await userEvent.type(within(dialog).getByLabelText('Amount'), '500000');
    const submit = within(dialog).getAllByRole('button', { name: 'Take out' }).at(-1);
    expect(submit).toBeDefined();
    if (submit) await userEvent.click(submit);
    expect(
      await within(dialog).findByText(sentence('The goal holds only 420 000 Ft')),
    ).toBeVisible();
    expect(api.entries).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText('Amount'));
    await userEvent.type(within(dialog).getByLabelText('Amount'), '55000');
    if (submit) await userEvent.click(submit);
    await waitFor(() => {
      expect(api.entries[0]).toMatchObject({ body: { amount: -55_000 } });
    });
    expect(await screen.findByText('Taken out of Summer in Italy')).toBeVisible();
  });

  it('removes only your own entries, after a confirm', async () => {
    const api = fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings/${trip.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Summer in Italy' });

    // One menu: Ben's entry has none.
    const menus = await within(dialog).findAllByRole('button', { name: 'Actions for this entry' });
    expect(menus).toHaveLength(1);
    await userEvent.click(menus[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove this entry?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(api.removed).toEqual(['01a12509-0f61-75bc-b406-1301087805e1']);
    });
    expect(await screen.findByText('Entry removed')).toBeVisible();
  });

  it('edits the name and target, never the visibility', async () => {
    const api = fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings/${trip.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Summer in Italy' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    const form = await screen.findByRole('dialog', { name: 'Edit goal' });
    expect(within(form).queryByText('Who sees it')).not.toBeInTheDocument();
    const name = within(form).getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Italy 2027');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.patches).toEqual([
        { name: 'Italy 2027', targetAmount: 600_000, targetDate: '2027-07-01' },
      ]);
    });
    expect(await screen.findByRole('dialog', { name: 'Italy 2027' })).toBeVisible();
  });

  it('closes a goal after a confirm that says what it still holds', async () => {
    const api = fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings/${trip.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Summer in Italy' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close goal' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Close Summer in Italy?' });
    expect(within(confirm).getByText(/It still holds/)).toBeVisible();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Close goal' }));

    await waitFor(() => {
      expect(api.archived).toEqual([trip.id]);
    });
    expect(await screen.findByText('Goal closed')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('button', { name: 'Closed goals (2)' })).toBeVisible();
  });

  it('shows a closed goal read-only, and leaves others goals to their maker', async () => {
    fakeApi([
      old,
      goal('Bens bike', {
        createdBy: ben,
        balance: 10_000,
        contributions: [{ ...ben, amount: 10_000 }],
      }),
    ]);
    server.use(
      mock.get(base, () =>
        HttpResponse.json({
          household: householdDetail({ ...testHousehold, role: 'member' }, [
            { ...anna, role: 'member', joinedAt: testHousehold.createdAt },
            { ...ben, role: 'owner', joinedAt: testHousehold.createdAt },
          ]),
        }),
      ),
    );
    renderRoute(`/h/${testHousehold.id}/savings/${old.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Old sofa' });
    expect(within(dialog).getByText(/^Closed on /)).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Add money' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Actions for this entry' }),
    ).not.toBeInTheDocument();
  });

  it('is not found for a goal the list does not have', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings/01a12509-0f61-75bc-b406-000000000000`);
    expect(await screen.findByRole('heading', { name: /not found$/ })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('getting there', () => {
  it('has a sidebar link, and a switch from Budgets for phones', async () => {
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/budgets`);
    expect(await screen.findByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();

    const sections = screen.getAllByRole('navigation', { name: 'Household sections' });
    expect(within(sections[0] as HTMLElement).getByRole('link', { name: 'Savings' })).toBeVisible();
    const viewSwitch = screen.getByRole('navigation', { name: 'Budgets or savings' });
    expect(within(viewSwitch).getByRole('link', { name: 'Budgets' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await userEvent.click(within(viewSwitch).getByRole('link', { name: 'Savings' }));
    expect(await screen.findByRole('heading', { name: 'Savings', level: 1 })).toBeVisible();
  });

  it('speaks Hungarian', async () => {
    await localeStore.setLocale('hu', { persist: false });
    fakeApi();
    renderRoute(`/h/${testHousehold.id}/savings`);
    expect(await screen.findByRole('heading', { name: 'Megtakarítások', level: 1 })).toBeVisible();
    expect(screen.getByText(sentence('Még 30 000 Ft a 75%-hoz'))).toBeVisible();
    expect(screen.getByText('4 mérföldkőből 2 elérve')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rainy day pot kitűzése' })).toBeVisible();
  });
});
