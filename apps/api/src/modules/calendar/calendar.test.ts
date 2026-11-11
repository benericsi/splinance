import {
  type CalendarEvent,
  calendarResponseSchema,
  calendarSchema,
  type Category,
  categoryListResponseSchema,
} from '@splinance/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { budapestToday } from '../../lib/today';
import { getCalendar } from './calendar.service';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;
let groceries: Category;
let entertainment: Category;
let salary: Category;

/** The day the calendar is read on: mid-October, so the month has a past and a future. */
const TODAY = '2026-10-20';

const base = (path = '') => `/api/households/${householdId}${path}`;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
  const res = await request(app)
    .get(base('/categories'))
    .set('Authorization', await bearer(anna))
    .expect(200);
  const { categories } = categoryListResponseSchema.parse(res.body);
  const named = (name: string) => {
    const found = categories.find((c) => c.name === name);
    if (!found) throw new Error(`No category ${name}`);
    return found;
  };
  groceries = named('Groceries');
  entertainment = named('Entertainment');
  salary = named('Salary');
});

async function post(user: TestUser, path: string, body: unknown) {
  const res = await request(app)
    .post(base(path))
    .set('Authorization', await bearer(user))
    .send(body as object);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as Record<string, { id: string }>;
}

/** A shared expense split equally by Anna and Ben unless overridden. */
const transaction = (user: TestUser, overrides: Record<string, unknown> = {}) => ({
  visibility: 'shared',
  kind: 'expense',
  amount: 10_000,
  occurredOn: '2026-10-10',
  description: 'Shop',
  categoryId: groceries.id,
  paidBy: user.id,
  split: { method: 'equal', userIds: [anna.id, ben.id] },
  ...overrides,
});

const add = (user: TestUser, overrides: Record<string, unknown> = {}) =>
  post(user, '/transactions', transaction(user, overrides));

const PRIVATE = { visibility: 'private', paidBy: undefined, split: undefined };

let fingerprints = 0;

/** Imports one bank row per date as `user`, shared and split equally. */
async function importRows(user: TestUser, counterparty: string, dates: string[], amount: number) {
  const rows = dates.map((occurredOn) => {
    fingerprints += 1;
    return {
      fingerprint: `kh:${String(fingerprints)}`,
      counterparty,
      transaction: transaction(user, {
        amount,
        occurredOn,
        description: counterparty,
        categoryId: entertainment.id,
      }),
    };
  });
  await post(user, '/imports', { source: 'kh', fileName: null, rows });
}

const series = (user: TestUser, overrides: Record<string, unknown>) =>
  post(user, '/recurring', {
    cadence: 'monthly',
    amountVaries: false,
    startsOn: null,
    categoryId: entertainment.id,
    scope: 'shared',
    remind: true,
    ...overrides,
  });

const calendar = async (user: TestUser, month: string) =>
  // Through the schema: what the service returns is what the web client will accept.
  calendarSchema.parse(
    await getCalendar({ userId: user.id, householdId }, { month }, { today: TODAY }),
  );

const day = async (user: TestUser, date: string) => {
  const found = (await calendar(user, date.slice(0, 7))).days.find((d) => d.date === date);
  if (!found) throw new Error(`No day ${date}`);
  return found;
};

/** `type date name amount/yourAmount`, in the order the calendar returns them. */
const brief = (events: CalendarEvent[]) =>
  events.map((event) =>
    event.type === 'settlement'
      ? `settlement ${event.date} ${event.from.displayName}>${event.to.displayName} ${String(event.amount)}`
      : `${event.type} ${event.date} ${event.name} ${String(event.amount)}/${String(event.yourAmount)}`,
  );

describe('GET /calendar', () => {
  it('returns every day of the month, zero when nothing happened', async () => {
    const res = await request(app)
      .get(base('/calendar'))
      .query({ month: '2028-02' })
      .set('Authorization', await bearer(anna))
      .expect(200);
    const body = calendarResponseSchema.parse(res.body).calendar;
    expect(body).toMatchObject({
      month: '2028-02',
      today: budapestToday(),
      currency: 'HUF',
      events: [],
    });
    // A leap year.
    expect(body.days).toHaveLength(29);
    expect(body.days[0]).toEqual({
      date: '2028-02-01',
      expenses: 0,
      income: 0,
      yourExpenses: 0,
      yourIncome: 0,
      count: 0,
    });
    expect(body.days.at(-1)?.date).toBe('2028-02-29');
  });

  it('totals each day as the viewer sees it, and their own part of it', async () => {
    await add(anna);
    await add(anna, { ...PRIVATE, amount: 3000 });
    await add(ben, { ...PRIVATE, amount: 4000 });
    await add(anna, {
      kind: 'income',
      amount: 20_000,
      occurredOn: '2026-10-05',
      categoryId: salary.id,
    });
    // Next door and deleted: not counted.
    await add(anna, { occurredOn: '2026-09-30' });
    await add(anna, { occurredOn: '2026-11-01' });
    const deleted = await add(anna, { amount: 999 });
    await request(app)
      .delete(base(`/transactions/${deleted.transaction?.id ?? ''}`))
      .set('Authorization', await bearer(anna))
      .expect(204);

    // Ben's private 4000 is not Anna's to see, nor her 3000 his.
    expect(await day(anna, '2026-10-10')).toMatchObject({
      expenses: 13_000,
      yourExpenses: 8000,
      income: 0,
      count: 2,
    });
    expect(await day(ben, '2026-10-10')).toMatchObject({
      expenses: 14_000,
      yourExpenses: 9000,
      count: 2,
    });
    expect(await day(anna, '2026-10-05')).toMatchObject({
      expenses: 0,
      income: 20_000,
      yourIncome: 10_000,
      count: 1,
    });
    const october = await calendar(anna, '2026-10');
    expect(october.days.filter((d) => d.count > 0).map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-10',
    ]);
  });

  it('shows tracked payments: the ones found, then the ones still expected', async () => {
    await series(anna, {
      name: 'Netflix',
      pattern: 'netflix',
      amount: 4490,
      anchorOn: '2026-08-03',
    });
    await importRows(ben, 'NETFLIX P1234', ['2026-08-03', '2026-09-03', '2026-10-03'], 4490);
    // Anna's own, first payment still ahead.
    await series(anna, {
      name: 'Gym',
      pattern: 'gym',
      amount: 14_900,
      anchorOn: '2026-10-25',
      scope: 'private',
    });
    // Last seen in July: overdue past its grace window, so nothing is expected of it.
    await series(anna, {
      name: 'Old club',
      pattern: 'oldclub',
      amount: 2000,
      anchorOn: '2026-07-01',
    });

    expect(brief((await calendar(anna, '2026-10')).events)).toEqual([
      'recurringPaid 2026-10-03 Netflix 4490/2245',
      'recurringExpected 2026-10-25 Gym 14900/14900',
    ]);
    // A private series is its owner's alone.
    expect(brief((await calendar(ben, '2026-10')).events)).toEqual([
      'recurringPaid 2026-10-03 Netflix 4490/2245',
    ]);
    // The share of an expected payment goes by the latest one's split.
    expect(brief((await calendar(anna, '2026-11')).events)).toEqual([
      'recurringExpected 2026-11-03 Netflix 4490/2245',
      'recurringExpected 2026-11-25 Gym 14900/14900',
    ]);
    // A past month has only what was paid.
    expect(brief((await calendar(anna, '2026-09')).events)).toEqual([
      'recurringPaid 2026-09-03 Netflix 4490/2245',
    ]);
    // Twelve months ahead is the last one with expectations.
    expect((await calendar(anna, '2027-10')).events).toHaveLength(2);
    expect((await calendar(anna, '2027-11')).events).toEqual([]);

    const [paid] = (await calendar(anna, '2026-10')).events;
    expect(paid).toMatchObject({
      type: 'recurringPaid',
      scope: 'shared',
      categoryId: entertainment.id,
    });
  });

  it('keeps an expected payment on the month end its series started on', async () => {
    await series(anna, {
      name: 'Rent',
      pattern: 'rent',
      amount: 180_000,
      amountVaries: true,
      anchorOn: '2027-01-31',
    });
    const dates = async (month: string) =>
      (await calendar(anna, month)).events.map((event) => event.date);
    expect(await dates('2027-01')).toEqual(['2027-01-31']);
    expect(await dates('2027-02')).toEqual(['2027-02-28']);
    expect(await dates('2027-03')).toEqual(['2027-03-31']);
    // Not before it starts.
    expect(await dates('2026-12')).toEqual([]);
    expect((await calendar(anna, '2027-02')).events[0]).toMatchObject({
      type: 'recurringExpected',
      amountVaries: true,
      // Shared, and no payment yet to tell the split.
      yourAmount: null,
    });
  });

  it('expects a weekly payment on every week left in the month', async () => {
    await series(anna, {
      name: 'Market',
      pattern: 'market',
      cadence: 'weekly',
      amount: 5000,
      anchorOn: '2026-10-22',
      scope: 'private',
    });
    expect((await calendar(anna, '2026-10')).events.map((event) => event.date)).toEqual([
      '2026-10-22',
      '2026-10-29',
    ]);
    expect((await calendar(anna, '2026-11')).events).toHaveLength(4);
  });

  it('shows settlements to every member, after the payments of the day', async () => {
    await series(anna, {
      name: 'Netflix',
      pattern: 'netflix',
      amount: 4490,
      anchorOn: '2026-10-12',
    });
    await importRows(anna, 'NETFLIX P1234', ['2026-10-12'], 4490);
    const settlement = {
      fromUserId: ben.id,
      toUserId: anna.id,
      amount: 5000,
      settledOn: '2026-10-12',
      note: '',
    };
    await post(ben, '/settlements', settlement);
    const removed = await post(ben, '/settlements', { ...settlement, amount: 7000 });
    await request(app)
      .delete(base(`/settlements/${removed.settlement?.id ?? ''}`))
      .set('Authorization', await bearer(ben))
      .expect(204);

    for (const viewer of [anna, ben]) {
      expect(brief((await calendar(viewer, '2026-10')).events)).toEqual([
        'recurringPaid 2026-10-12 Netflix 4490/2245',
        'settlement 2026-10-12 Ben>Anna 5000',
      ]);
    }
  });

  it('refuses a malformed month', async () => {
    for (const query of [{}, { month: '2026-1' }, { month: '2026-13' }, { month: '2026-10-01' }]) {
      const res = await request(app)
        .get(base('/calendar'))
        .query(query)
        .set('Authorization', await bearer(anna));
      expect(res.status).toBe(400);
      expect(errorCode(res)).toBe('VALIDATION_ERROR');
    }
  });

  it('hides the calendar from outsiders', async () => {
    const outsider = await createTestUser('Eve');
    const res = await request(app)
      .get(base('/calendar'))
      .query({ month: '2026-10' })
      .set('Authorization', await bearer(outsider));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
  });
});
