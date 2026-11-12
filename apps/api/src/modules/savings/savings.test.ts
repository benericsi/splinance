import {
  balancesResponseSchema,
  type SavingsGoal,
  savingsEntryListResponseSchema,
  savingsEntryResponseSchema,
  savingsGoalResponseSchema,
  savingsResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join, leave } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { savingsEntries, savingsGoals } from '../../db/schema';

let app: App;
let anna: TestUser;
let ben: TestUser;
let cara: TestUser;
let householdId: string;

const base = (suffix = '') => `/api/households/${householdId}/savings${suffix}`;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  cara = await createTestUser('Cara');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
  await join(app, anna, householdId, cara);
});

const goalInput = (overrides: Record<string, unknown> = {}) => ({
  name: 'Summer in Italy',
  targetAmount: 600_000,
  targetDate: '2027-07-01',
  visibility: 'shared',
  ...overrides,
});

const entryInput = (amount: number, overrides: Record<string, unknown> = {}) => ({
  amount,
  entryOn: '2026-11-03',
  note: null,
  ...overrides,
});

async function send(
  user: TestUser,
  method: 'post' | 'patch' | 'delete' | 'get',
  suffix: string,
  body?: object,
) {
  const req = request(app)
    [method](base(suffix))
    .set('Authorization', await bearer(user));
  return body ? req.send(body) : req;
}

async function createGoal(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await send(user, 'post', '', goalInput(overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return savingsGoalResponseSchema.parse(res.body).goal;
}

async function add(user: TestUser, goal: SavingsGoal, amount: number, overrides = {}) {
  const res = await send(user, 'post', `/${goal.id}/entries`, entryInput(amount, overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return savingsEntryResponseSchema.parse(res.body);
}

async function savings(user: TestUser, month?: string) {
  const res = await request(app)
    .get(base())
    .query(month ? { month } : {})
    .set('Authorization', await bearer(user))
    .expect(200);
  return savingsResponseSchema.parse(res.body).savings;
}

async function entries(user: TestUser, goal: SavingsGoal, query: Record<string, string> = {}) {
  const res = await request(app)
    .get(base(`/${goal.id}/entries`))
    .query(query)
    .set('Authorization', await bearer(user))
    .expect(200);
  return savingsEntryListResponseSchema.parse(res.body);
}

describe('goals', () => {
  it('creates a goal in the household currency, empty', async () => {
    const goal = await createGoal(ben, { name: '  Summer in Italy  ' });
    expect(goal).toMatchObject({
      name: 'Summer in Italy',
      targetAmount: 600_000,
      targetDate: '2027-07-01',
      currency: 'HUF',
      visibility: 'shared',
      createdBy: { userId: ben.id, displayName: 'Ben' },
      archivedAt: null,
      balance: 0,
      contributions: [],
    });

    const pot = await createGoal(ben, { name: 'Pot', targetAmount: null, targetDate: null });
    expect(pot).toMatchObject({ targetAmount: null, targetDate: null });
  });

  it('validates the input', async () => {
    for (const overrides of [
      { name: '   ' },
      { name: 'x'.repeat(61) },
      { targetAmount: 0 },
      { targetAmount: 1.5 },
      { targetDate: '2027-13-01' },
      { visibility: 'secret' },
    ]) {
      const res = await send(ben, 'post', '', goalInput(overrides));
      expect(res.status, JSON.stringify(overrides)).toBe(400);
      expect(errorCode(res)).toBe('VALIDATION_ERROR');
    }
  });

  it('is 404 for outsiders and former members, 401 without a token', async () => {
    const goal = await createGoal(ben);
    const outsider = await createTestUser('Eve');
    await leave(app, householdId, cara);
    for (const user of [outsider, cara]) {
      expect((await send(user, 'get', '')).status).toBe(404);
      expect((await send(user, 'post', '', goalInput())).status).toBe(404);
      expect((await send(user, 'get', `/${goal.id}`)).status).toBe(404);
      expect((await send(user, 'post', `/${goal.id}/entries`, entryInput(1))).status).toBe(404);
    }
    await request(app).get(base()).expect(401);
  });

  it('answers 404 for unknown and malformed ids, and goals of another household', async () => {
    const other = await createHousehold(app, ben, 'Other');
    const res = await request(app)
      .post(`/api/households/${other}/savings`)
      .set('Authorization', await bearer(ben))
      .send(goalInput())
      .expect(201);
    const elsewhere = savingsGoalResponseSchema.parse(res.body).goal;

    for (const id of [elsewhere.id, '0198a7a0-0000-7000-8000-000000000000', 'nope']) {
      const found = await send(ben, 'get', `/${id}`);
      expect(found.status).toBe(404);
      expect(errorCode(found)).toBe('SAVINGS_GOAL_NOT_FOUND');
    }
  });

  it('keeps a private goal to its maker, owners included', async () => {
    const goal = await createGoal(ben, { name: 'Ring', visibility: 'private' });
    await add(ben, goal, 50_000);

    // Anna is the owner and still sees nothing of it.
    for (const user of [anna, cara]) {
      expect((await savings(user, '2026-11')).goals).toEqual([]);
      expect((await send(user, 'get', `/${goal.id}`)).status).toBe(404);
      expect((await send(user, 'get', `/${goal.id}/entries`)).status).toBe(404);
      expect((await send(user, 'post', `/${goal.id}/entries`, entryInput(1))).status).toBe(404);
      expect((await send(user, 'patch', `/${goal.id}`, goalInput())).status).toBe(404);
      expect((await send(user, 'post', `/${goal.id}/archive`)).status).toBe(404);
    }
    expect((await savings(ben)).goals.map((g) => g.name)).toEqual(['Ring']);
  });

  it('lets the maker or an owner edit a shared goal, not other members', async () => {
    const goal = await createGoal(ben);
    const edit = { name: 'Italy 2027', targetAmount: 700_000, targetDate: null };

    const byCara = await send(cara, 'patch', `/${goal.id}`, edit);
    expect(byCara.status).toBe(403);
    expect(errorCode(byCara)).toBe('FORBIDDEN');

    const byBen = await send(ben, 'patch', `/${goal.id}`, edit);
    expect(savingsGoalResponseSchema.parse(byBen.body).goal).toMatchObject({
      ...edit,
      visibility: 'shared',
    });
    expect((await send(anna, 'patch', `/${goal.id}`, { ...edit, name: 'Trip' })).status).toBe(200);
    // The visibility is not part of an edit.
    await send(ben, 'patch', `/${goal.id}`, { ...edit, visibility: 'private' });
    expect((await savings(cara)).goals[0]?.visibility).toBe('shared');
  });

  it('archives: the goal stays listed last, with its history, and takes nothing new', async () => {
    const closed = await createGoal(ben, { name: 'Closed' });
    const open = await createGoal(ben, { name: 'Open' });
    const { entry } = await add(ben, closed, 10_000);

    expect((await send(cara, 'post', `/${closed.id}/archive`)).status).toBe(403);
    expect((await send(ben, 'post', `/${closed.id}/archive`)).status).toBe(204);
    // Again changes nothing.
    expect((await send(anna, 'post', `/${closed.id}/archive`)).status).toBe(204);

    const { goals } = await savings(cara);
    expect(goals.map((g) => [g.name, g.archivedAt !== null, g.balance])).toEqual([
      [open.name, false, 0],
      [closed.name, true, 10_000],
    ]);
    expect((await entries(cara, closed)).entries).toHaveLength(1);

    for (const res of [
      await send(ben, 'post', `/${closed.id}/entries`, entryInput(1)),
      await send(ben, 'delete', `/${closed.id}/entries/${entry.id}`),
      await send(ben, 'patch', `/${closed.id}`, goalInput()),
    ]) {
      expect(res.status).toBe(409);
      expect(errorCode(res)).toBe('SAVINGS_GOAL_ARCHIVED');
    }
  });
});

describe('entries', () => {
  it('adds up what each member put in and took out', async () => {
    const goal = await createGoal(anna);
    await add(anna, goal, 240_000);
    await add(ben, goal, 180_000, { note: '  bonus  ' });
    const { entry, goal: after } = await add(anna, goal, -55_000, { note: 'flights' });

    expect(entry).toMatchObject({
      user: { userId: anna.id, displayName: 'Anna' },
      amount: -55_000,
      entryOn: '2026-11-03',
      note: 'flights',
    });
    expect(after.balance).toBe(365_000);
    expect(after.contributions).toEqual([
      { userId: anna.id, displayName: 'Anna', amount: 185_000 },
      { userId: ben.id, displayName: 'Ben', amount: 180_000 },
    ]);
    // Cara put nothing in and sees the same goal.
    expect((await savings(cara)).goals[0]).toEqual(after);
    expect((await entries(cara, goal)).entries.map((e) => e.note)).toEqual([
      'flights',
      'bonus',
      null,
    ]);
  });

  it('validates the input', async () => {
    const goal = await createGoal(anna);
    for (const overrides of [
      { amount: 0 },
      { amount: 10.5 },
      { amount: 1_000_000_000_001 },
      { amount: -1_000_000_000_001 },
      { entryOn: '2026-02-30' },
      { note: 'x'.repeat(201) },
    ]) {
      const res = await send(anna, 'post', `/${goal.id}/entries`, entryInput(1, overrides));
      expect(res.status, JSON.stringify(overrides)).toBe(400);
    }
  });

  it('never lets a goal go below zero', async () => {
    const goal = await createGoal(anna);
    const { entry } = await add(anna, goal, 10_000);

    const tooMuch = await send(ben, 'post', `/${goal.id}/entries`, entryInput(-10_001));
    expect(tooMuch.status).toBe(409);
    expect(errorCode(tooMuch)).toBe('INSUFFICIENT_SAVINGS');

    // Ben takes out what Anna put in: allowed, and now her entry cannot be removed.
    await add(ben, goal, -10_000);
    const removal = await send(anna, 'delete', `/${goal.id}/entries/${entry.id}`);
    expect(removal.status).toBe(409);
    expect(errorCode(removal)).toBe('INSUFFICIENT_SAVINGS');
  });

  it('holds the balance under concurrent withdrawals', async () => {
    const goal = await createGoal(anna);
    await add(anna, goal, 10_000);

    const results = await Promise.all(
      [anna, ben, cara].map((user) =>
        send(user, 'post', `/${goal.id}/entries`, entryInput(-10_000)),
      ),
    );
    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    expect((await savings(anna)).goals[0]?.balance).toBe(0);
  });

  it('removes only your own entries, softly', async () => {
    const goal = await createGoal(anna);
    const { entry } = await add(ben, goal, 10_000);

    // Not even the owner removes someone else's.
    const byAnna = await send(anna, 'delete', `/${goal.id}/entries/${entry.id}`);
    expect(byAnna.status).toBe(403);
    expect(errorCode(byAnna)).toBe('FORBIDDEN');

    expect((await send(ben, 'delete', `/${goal.id}/entries/${entry.id}`)).status).toBe(204);
    expect((await savings(ben)).goals[0]).toMatchObject({ balance: 0, contributions: [] });
    expect((await entries(ben, goal)).entries).toEqual([]);
    const [row] = await db.select().from(savingsEntries).where(eq(savingsEntries.id, entry.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);

    // Gone is gone, and an entry is only found under its own goal.
    const again = await send(ben, 'delete', `/${goal.id}/entries/${entry.id}`);
    expect(again.status).toBe(404);
    expect(errorCode(again)).toBe('SAVINGS_ENTRY_NOT_FOUND');
    const other = await createGoal(ben, { name: 'Other' });
    const { entry: kept } = await add(ben, goal, 5_000);
    expect((await send(ben, 'delete', `/${other.id}/entries/${kept.id}`)).status).toBe(404);
  });

  it('pages the history newest first', async () => {
    const goal = await createGoal(anna);
    for (const day of ['01', '02', '03'])
      await add(anna, goal, 1_000, { entryOn: `2026-11-${day}` });

    const first = await entries(anna, goal, { limit: '2' });
    expect(first.entries.map((e) => e.entryOn)).toEqual(['2026-11-03', '2026-11-02']);
    expect(first.nextCursor).not.toBeNull();
    const second = await entries(anna, goal, { limit: '2', cursor: first.nextCursor ?? '' });
    expect(second.entries.map((e) => e.entryOn)).toEqual(['2026-11-01']);
    expect(second.nextCursor).toBeNull();

    const bad = await request(app)
      .get(base(`/${goal.id}/entries`))
      .query({ cursor: 'nope' })
      .set('Authorization', await bearer(anna));
    expect(bad.status).toBe(400);
  });
});

describe('set aside', () => {
  it('is the viewer own net entries in the month, over shared and private goals', async () => {
    const trip = await createGoal(anna);
    const ring = await createGoal(ben, { name: 'Ring', visibility: 'private' });
    await add(ben, trip, 30_000, { entryOn: '2026-11-01' });
    await add(ben, ring, 50_000, { entryOn: '2026-11-30' });
    await add(ben, trip, -10_000, { entryOn: '2026-11-15' });
    // Other months and other people do not count.
    await add(ben, trip, 99_000, { entryOn: '2026-10-31' });
    await add(ben, trip, 77_000, { entryOn: '2026-12-01' });
    await add(anna, trip, 40_000, { entryOn: '2026-11-10' });
    // Neither does a removed entry.
    const { entry } = await add(ben, trip, 5_000, { entryOn: '2026-11-20' });
    await send(ben, 'delete', `/${trip.id}/entries/${entry.id}`);

    expect((await savings(ben, '2026-11')).setAside).toBe(70_000);
    expect((await savings(anna, '2026-11')).setAside).toBe(40_000);
    expect((await savings(cara, '2026-11')).setAside).toBe(0);
    expect((await savings(ben, '2026-12')).setAside).toBe(77_000);
    expect((await savings(ben)).setAside).toBeNull();
  });

  it('goes negative when more came out than went in', async () => {
    const trip = await createGoal(anna);
    await add(ben, trip, 30_000, { entryOn: '2026-10-05' });
    await add(ben, trip, -20_000, { entryOn: '2026-11-05' });
    expect((await savings(ben, '2026-11')).setAside).toBe(-20_000);
  });

  it('rejects a malformed month', async () => {
    const res = await request(app)
      .get(base())
      .query({ month: '2026-13' })
      .set('Authorization', await bearer(ben));
    expect(res.status).toBe(400);
  });
});

describe('outside savings', () => {
  it('creates no debt and blocks nobody from leaving', async () => {
    const goal = await createGoal(anna);
    await add(ben, goal, 100_000);

    const res = await request(app)
      .get(`/api/households/${householdId}/balances`)
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(balancesResponseSchema.parse(res.body).balances.debts).toEqual([]);

    await leave(app, householdId, ben);
    // What he put in stays in the goal, under his name.
    expect((await savings(anna)).goals[0]).toMatchObject({
      balance: 100_000,
      contributions: [{ userId: ben.id, displayName: 'Ben', amount: 100_000 }],
    });
  });
});

describe('constraints', () => {
  it('keeps entries inside their goal household, non-zero and in range', async () => {
    const goal = await createGoal(anna);
    const other = await createHousehold(app, anna, 'Other');
    const entry = {
      householdId,
      goalId: goal.id,
      userId: anna.id,
      amount: 1,
      entryOn: '2026-11-03',
    };

    expect(
      await pgErrorOf(db.insert(savingsEntries).values({ ...entry, householdId: other })),
    ).toMatchObject({ constraint: 'savings_entries_goal_fk' });
    const stranger = await createTestUser('Eve');
    expect(
      await pgErrorOf(db.insert(savingsEntries).values({ ...entry, userId: stranger.id })),
    ).toMatchObject({ constraint: 'savings_entries_user_member_fk' });
    expect(
      await pgErrorOf(db.insert(savingsEntries).values({ ...entry, amount: 0 })),
    ).toMatchObject({ constraint: 'savings_entries_amount_range' });
    expect(
      await pgErrorOf(
        db.update(savingsGoals).set({ name: '' }).where(eq(savingsGoals.id, goal.id)),
      ),
    ).toMatchObject({ constraint: 'savings_goals_name_length' });
    expect(
      await pgErrorOf(
        db.update(savingsGoals).set({ targetAmount: 0 }).where(eq(savingsGoals.id, goal.id)),
      ),
    ).toMatchObject({ constraint: 'savings_goals_target_range' });
  });
});
