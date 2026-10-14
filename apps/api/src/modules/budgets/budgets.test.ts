import {
  type BudgetList,
  budgetListResponseSchema,
  type Category,
  categoryListResponseSchema,
} from '@splinance/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { budgets } from '../../db/schema';

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

async function setBudget(category: Category, amount: number | null, from: string, user = anna) {
  return request(app)
    .put(base(`/budgets/${category.id}`))
    .set('Authorization', await bearer(user))
    .send({ amount, from });
}

async function list(month: string, user = anna): Promise<BudgetList> {
  const res = await request(app)
    .get(base('/budgets'))
    .query({ month })
    .set('Authorization', await bearer(user))
    .expect(200);
  return budgetListResponseSchema.parse(res.body).budgets;
}

const amounts = async (month: string) =>
  (await list(month)).budgets.map((b) => [b.categoryId, b.amount, b.since]);

async function expense(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(base('/transactions'))
    .set('Authorization', await bearer(anna))
    .send({
      visibility: 'shared',
      kind: 'expense',
      amount: 10_000,
      occurredOn: '2026-10-10',
      description: 'Shop',
      categoryId: groceries.id,
      paidBy: anna.id,
      split: { method: 'equal', userIds: [anna.id, ben.id] },
      ...overrides,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { transaction: { id: string } };
}

describe('budgets over time', () => {
  it('is empty until one is set', async () => {
    expect(await list('2026-10')).toEqual({ month: '2026-10', currency: 'HUF', budgets: [] });
  });

  it('holds an amount from its month on until changed or removed', async () => {
    expect((await setBudget(groceries, 80_000, '2026-09')).status).toBe(204);
    expect((await setBudget(groceries, 100_000, '2026-11')).status).toBe(204);
    // Setting a month again replaces it.
    expect((await setBudget(groceries, 90_000, '2026-11', ben)).status).toBe(204);
    expect((await setBudget(groceries, null, '2027-01')).status).toBe(204);

    expect(await amounts('2026-08')).toEqual([]);
    expect(await amounts('2026-10')).toEqual([[groceries.id, 80_000, '2026-09']]);
    expect(await amounts('2026-12')).toEqual([[groceries.id, 90_000, '2026-11']]);
    expect(await amounts('2027-03')).toEqual([]);
  });

  it('drops categories that were archived since', async () => {
    await setBudget(eatingOut, 30_000, '2026-10');
    await request(app)
      .delete(base(`/categories/${eatingOut.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    expect(await amounts('2026-10')).toEqual([]);
  });
});

describe('spending against budgets', () => {
  it('counts whole shared expenses of the category in the month', async () => {
    await setBudget(groceries, 80_000, '2026-01');
    await setBudget(eatingOut, 30_000, '2026-01');

    await expense({ amount: 12_000 });
    await expense({ amount: 8000, occurredOn: '2026-10-31' });
    await expense({ amount: 5000, categoryId: eatingOut.id });
    // Not counted: another month, private, deleted, uncategorized, income.
    await expense({ occurredOn: '2026-09-30' });
    await request(app)
      .post(base('/transactions'))
      .set('Authorization', await bearer(anna))
      .send({
        visibility: 'private',
        kind: 'expense',
        amount: 7000,
        occurredOn: '2026-10-10',
        description: 'Private',
        categoryId: groceries.id,
      })
      .expect(201);
    const deleted = await expense({ amount: 999 });
    await request(app)
      .delete(base(`/transactions/${deleted.transaction.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    await expense({ categoryId: null });
    await expense({ kind: 'income', categoryId: salary.id });

    const october = await list('2026-10', ben);
    const spent = Object.fromEntries(october.budgets.map((b) => [b.categoryId, b.spent]));
    expect(spent).toEqual({ [groceries.id]: 20_000, [eatingOut.id]: 5000 });
  });
});

describe('validation and access', () => {
  it('only budgets active expense categories of the household', async () => {
    expect(errorCode(await setBudget(salary, 1000, '2026-10'))).toBe('INVALID_CATEGORY');
    const other = await createHousehold(app, ben, 'Other');
    const res = await request(app)
      .get(`/api/households/${other}/categories`)
      .set('Authorization', await bearer(ben))
      .expect(200);
    const foreign = categoryListResponseSchema.parse(res.body).categories[0];
    if (!foreign) throw new Error('No category');
    expect(errorCode(await setBudget(foreign, 1000, '2026-10'))).toBe('INVALID_CATEGORY');
  });

  it('validates amounts, months and ids', async () => {
    expect((await setBudget(groceries, 0, '2026-10')).status).toBe(400);
    expect((await setBudget(groceries, 1000, '2026-13')).status).toBe(400);
    await request(app)
      .put(base('/budgets/not-a-uuid'))
      .set('Authorization', await bearer(anna))
      .send({ amount: 1000, from: '2026-10' })
      .expect(404);
    await request(app)
      .get(base('/budgets'))
      .set('Authorization', await bearer(anna))
      .expect(400);
  });

  it('hides budgets from outsiders', async () => {
    const outsider = await createTestUser('Eve');
    const res = await request(app)
      .get(base('/budgets'))
      .query({ month: '2026-10' })
      .set('Authorization', await bearer(outsider));
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
  });
});

describe('database-level protection', () => {
  const row = () => ({
    householdId,
    categoryId: groceries.id,
    startsOn: '2026-10-01',
    amount: 1000,
    createdBy: anna.id,
  });

  it('keeps one household amount per category and month, even with a null owner', async () => {
    await db.insert(budgets).values(row());
    const error = await pgErrorOf(db.insert(budgets).values(row()));
    expect(error).toMatchObject({
      code: '23505',
      constraint: 'budgets_category_owner_month_unique',
    });
  });

  it('starts budgets on the first of a month and only for expenses', async () => {
    const midMonth = await pgErrorOf(
      db.insert(budgets).values({ ...row(), startsOn: '2026-10-15' }),
    );
    expect(midMonth).toMatchObject({ code: '23514', constraint: 'budgets_month_start' });
    const income = await pgErrorOf(
      db.insert(budgets).values({ ...row(), categoryId: salary.id, kind: 'income' }),
    );
    expect(income).toMatchObject({ code: '23514', constraint: 'budgets_expense_only' });
  });
});
