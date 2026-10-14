import {
  type Category,
  categoryListResponseSchema,
  ruleApplyResponseSchema,
  ruleListResponseSchema,
  ruleMatchesResponseSchema,
  ruleResponseSchema,
  transactionResponseSchema,
} from '@splinance/shared';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { auditLog, categoryRules } from '../../db/schema';

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

async function create(user: TestUser, body: object) {
  return request(app)
    .post(base('/rules'))
    .set('Authorization', await bearer(user))
    .send(body);
}

async function rule(pattern: string, category: Category = groceries, markShared = false) {
  const res = await create(anna, { pattern, categoryId: category.id, markShared });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return ruleResponseSchema.parse(res.body).rule;
}

async function list(user: TestUser = anna) {
  const res = await request(app)
    .get(base('/rules'))
    .set('Authorization', await bearer(user))
    .expect(200);
  return ruleListResponseSchema.parse(res.body).rules;
}

/** A transaction as the API creates it; `counterparty` needs an import. */
async function transaction(
  user: TestUser,
  overrides: Record<string, unknown> = {},
  counterparty: string | null = null,
) {
  const input = {
    visibility: 'shared',
    kind: 'expense',
    amount: 3000,
    occurredOn: '2026-10-10',
    description: 'Something',
    categoryId: null,
    paidBy: user.id,
    split: { method: 'equal', userIds: [anna.id, ben.id] },
    ...overrides,
  };
  if (counterparty !== null) {
    await request(app)
      .post(base('/imports'))
      .set('Authorization', await bearer(user))
      .send({
        source: 'kh',
        fileName: null,
        rows: [{ fingerprint: `kh:${counterparty}`, counterparty, transaction: input }],
      })
      .expect(201);
    return;
  }
  const res = await request(app)
    .post(base('/transactions'))
    .set('Authorization', await bearer(user))
    .send(input)
    .expect(201);
  return transactionResponseSchema.parse(res.body).transaction;
}

describe('rules CRUD', () => {
  it('creates rules last in order, with the category kind', async () => {
    const first = await rule('tesco', groceries, true);
    const second = await rule('salary', salary);
    expect(first).toMatchObject({
      pattern: 'tesco',
      categoryId: groceries.id,
      kind: 'expense',
      markShared: true,
      position: 0,
    });
    expect(second).toMatchObject({ kind: 'income', position: 1 });
    expect((await list(ben)).map((r) => r.pattern)).toEqual(['tesco', 'salary']);
  });

  it('refuses the same text twice per kind, ignoring case and accents', async () => {
    await rule('Gyógyszertár');
    const again = await create(anna, {
      pattern: 'GYOGYSZERTAR',
      categoryId: eatingOut.id,
      markShared: false,
    });
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe('RULE_PATTERN_TAKEN');
    // The same text for income is a different rule.
    await rule('gyógyszertár', salary);
  });

  it('needs an active category of this household', async () => {
    await request(app)
      .delete(base(`/categories/${eatingOut.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    const archived = await create(anna, {
      pattern: 'kebab',
      categoryId: eatingOut.id,
      markShared: false,
    });
    expect(errorCode(archived)).toBe('INVALID_CATEGORY');

    const otherHousehold = await createHousehold(app, ben, 'Other');
    const res = await request(app)
      .get(`/api/households/${otherHousehold}/categories`)
      .set('Authorization', await bearer(ben))
      .expect(200);
    const foreign = categoryListResponseSchema.parse(res.body).categories[0];
    const elsewhere = await create(anna, {
      pattern: 'kebab',
      categoryId: foreign?.id,
      markShared: false,
    });
    expect(errorCode(elsewhere)).toBe('INVALID_CATEGORY');
  });

  it('updates, reorders and deletes', async () => {
    const tesco = await rule('tesco');
    const pizza = await rule('pizza');

    const updated = await request(app)
      .patch(base(`/rules/${tesco.id}`))
      .set('Authorization', await bearer(ben))
      .send({ pattern: 'TESCO 44049', categoryId: eatingOut.id, markShared: true })
      .expect(200);
    expect(ruleResponseSchema.parse(updated.body).rule).toMatchObject({
      pattern: 'TESCO 44049',
      categoryId: eatingOut.id,
      markShared: true,
    });

    const reordered = await request(app)
      .put(base('/rules/order'))
      .set('Authorization', await bearer(anna))
      .send({ ruleIds: [pizza.id, tesco.id] })
      .expect(200);
    expect(ruleListResponseSchema.parse(reordered.body).rules.map((r) => r.pattern)).toEqual([
      'pizza',
      'TESCO 44049',
    ]);
    const partial = await request(app)
      .put(base('/rules/order'))
      .set('Authorization', await bearer(anna))
      .send({ ruleIds: [pizza.id] });
    expect(errorCode(partial)).toBe('RULE_ORDER_MISMATCH');

    await request(app)
      .delete(base(`/rules/${pizza.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    await request(app)
      .delete(base(`/rules/${pizza.id}`))
      .set('Authorization', await bearer(anna))
      .expect(404);
    await request(app)
      .patch(base('/rules/not-a-uuid'))
      .set('Authorization', await bearer(anna))
      .send({ markShared: true })
      .expect(404);
  });

  it('hides rules from outsiders', async () => {
    const outsider = await createTestUser('Eve');
    const res = await request(app)
      .get(base('/rules'))
      .set('Authorization', await bearer(outsider));
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
  });
});

describe('applying a rule to earlier transactions', () => {
  it('categorizes visible, uncategorized matches of its kind, audited', async () => {
    await transaction(anna, {}, 'TESCO 44049 O NKISZOLG');
    await transaction(anna, { description: 'Tésco weekly' });
    await transaction(anna, { description: 'Tesco, already sorted', categoryId: eatingOut.id });
    await transaction(anna, { kind: 'income', description: 'Tesco refund' });
    // Ben's private one: not Anna's to see, so not hers to categorize.
    await transaction(ben, { visibility: 'private', description: 'Tesco snacks' });
    const tesco = await rule('tesco');

    const matches = await request(app)
      .get(base(`/rules/${tesco.id}/matches`))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(ruleMatchesResponseSchema.parse(matches.body).count).toBe(2);

    const applied = await request(app)
      .post(base(`/rules/${tesco.id}/apply`))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(ruleApplyResponseSchema.parse(applied.body).updated).toBe(2);

    const updates = await db
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'transaction'), eq(auditLog.action, 'update')));
    expect(updates).toEqual([{ actorId: anna.id }, { actorId: anna.id }]);

    // Nothing left for Anna; Ben's private one is his to apply.
    const again = await request(app)
      .post(base(`/rules/${tesco.id}/apply`))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(ruleApplyResponseSchema.parse(again.body).updated).toBe(0);
    const forBen = await request(app)
      .post(base(`/rules/${tesco.id}/apply`))
      .set('Authorization', await bearer(ben))
      .expect(200);
    expect(ruleApplyResponseSchema.parse(forBen.body).updated).toBe(1);
  });

  it('bumps the version, so an edit opened before gets a conflict', async () => {
    const pizza = await transaction(anna, { description: 'Pizza' });
    const pizzaRule = await rule('pizza', eatingOut);
    await request(app)
      .post(base(`/rules/${pizzaRule.id}/apply`))
      .set('Authorization', await bearer(anna))
      .expect(200);

    const stale = await request(app)
      .put(base(`/transactions/${pizza?.id ?? ''}`))
      .set('Authorization', await bearer(anna))
      .send({
        visibility: 'private',
        kind: 'expense',
        amount: 3000,
        occurredOn: '2026-10-10',
        description: 'Pizza',
        categoryId: null,
        version: 1,
      });
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
  });

  it('refuses to apply a rule whose category was archived since', async () => {
    const pizzaRule = await rule('pizza', eatingOut);
    await request(app)
      .delete(base(`/categories/${eatingOut.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    const res = await request(app)
      .post(base(`/rules/${pizzaRule.id}/apply`))
      .set('Authorization', await bearer(anna));
    expect(errorCode(res)).toBe('INVALID_CATEGORY');
  });
});

describe('database-level protection', () => {
  it('keeps the rule kind equal to its category kind (composite FK)', async () => {
    const error = await pgErrorOf(
      db.insert(categoryRules).values({
        householdId,
        pattern: 'salary',
        patternKey: 'salary',
        categoryId: salary.id,
        kind: 'expense',
        position: 0,
        createdBy: anna.id,
      }),
    );
    expect(error).toMatchObject({ code: '23503', constraint: 'category_rules_category_fk' });
  });
});
