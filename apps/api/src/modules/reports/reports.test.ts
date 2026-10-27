import {
  type Category,
  categoryListResponseSchema,
  type Report,
  reportResponseSchema,
} from '@splinance/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;
let groceries: Category;
let eatingOut: Category;
let salary: Category;

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
  eatingOut = named('Eating out');
  salary = named('Salary');
});

/** A shared expense split equally by Anna and Ben unless overridden. */
async function add(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(base('/transactions'))
    .set('Authorization', await bearer(user))
    .send({
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
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { transaction: { id: string } };
}

const privately = (amount: number, categoryId: string | null = groceries.id) => ({
  visibility: 'private',
  amount,
  categoryId,
  paidBy: undefined,
  split: undefined,
});

async function report(user: TestUser, from: string, to: string): Promise<Report> {
  const res = await request(app)
    .get(base('/reports'))
    .query({ from, to })
    .set('Authorization', await bearer(user))
    .expect(200);
  return reportResponseSchema.parse(res.body).report;
}

describe('GET /reports', () => {
  it('returns every month of the range, zero when nothing happened', async () => {
    expect(await report(anna, '2026-08', '2026-10')).toEqual({
      from: '2026-08',
      to: '2026-10',
      currency: 'HUF',
      months: ['2026-08', '2026-09', '2026-10'].map((month) => ({
        month,
        expenses: 0,
        income: 0,
        yourExpenses: 0,
        yourIncome: 0,
      })),
      categories: [],
    });
  });

  it('totals what the viewer sees, and their own part of it', async () => {
    await add(anna);
    await add(anna, privately(3000));
    await add(ben, { amount: 6000, categoryId: eatingOut.id });
    await add(ben, privately(4000));
    await add(anna, { amount: 1000, categoryId: null });
    await add(anna, { kind: 'income', amount: 20_000, categoryId: salary.id });
    await add(anna, { amount: 2000, occurredOn: '2026-09-30' });
    // Out of range and deleted: not counted.
    await add(anna, { occurredOn: '2026-07-31' });
    const deleted = await add(anna, { amount: 999 });
    await request(app)
      .delete(base(`/transactions/${deleted.transaction.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);

    const forAnna = await report(anna, '2026-08', '2026-10');
    expect(forAnna.months).toEqual([
      { month: '2026-08', expenses: 0, income: 0, yourExpenses: 0, yourIncome: 0 },
      { month: '2026-09', expenses: 2000, income: 0, yourExpenses: 1000, yourIncome: 0 },
      // Ben's private 4000 is not Anna's to see.
      {
        month: '2026-10',
        expenses: 20_000,
        income: 20_000,
        yourExpenses: 11_500,
        yourIncome: 10_000,
      },
    ]);
    const byKey = (r: Report) =>
      Object.fromEntries(
        r.categories.map((c) => [
          `${c.month} ${c.categoryId ?? 'none'}`,
          [c.expenses, c.yourExpenses],
        ]),
      );
    expect(byKey(forAnna)).toEqual({
      [`2026-09 ${groceries.id}`]: [2000, 1000],
      [`2026-10 ${groceries.id}`]: [13_000, 8000],
      [`2026-10 ${eatingOut.id}`]: [6000, 3000],
      '2026-10 none': [1000, 500],
    });

    const forBen = await report(ben, '2026-10', '2026-10');
    expect(forBen.months).toEqual([
      {
        month: '2026-10',
        expenses: 21_000,
        income: 20_000,
        yourExpenses: 12_500,
        yourIncome: 10_000,
      },
    ]);
  });

  it('refuses a backwards or too long range', async () => {
    for (const query of [
      { from: '2026-10', to: '2026-09' },
      { from: '2024-01', to: '2026-10' },
      { from: '2026-1', to: '2026-10' },
    ]) {
      const res = await request(app)
        .get(base('/reports'))
        .query(query)
        .set('Authorization', await bearer(anna));
      expect(res.status).toBe(400);
      expect(errorCode(res)).toBe('VALIDATION_ERROR');
    }
  });

  it('hides reports from outsiders', async () => {
    const outsider = await createTestUser('Eve');
    const res = await request(app)
      .get(base('/reports'))
      .query({ from: '2026-10', to: '2026-10' })
      .set('Authorization', await bearer(outsider));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
  });
});
