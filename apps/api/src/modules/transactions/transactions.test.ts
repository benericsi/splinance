import {
  categoryListResponseSchema,
  type Transaction,
  transactionHistoryResponseSchema,
  transactionListResponseSchema,
  transactionResponseSchema,
  transactionSummaryResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join, leave } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { transactions, transactionSplits } from '../../db/schema';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;

const base = (path = '') => `/api/households/${householdId}/transactions${path}`;

/** Ids sorted the way the API orders shares (and hands out leftover units). */
const byId = (...users: TestUser[]) => users.map((u) => u.id).sort();

function sharedInput(overrides: Record<string, unknown> = {}) {
  return {
    visibility: 'shared',
    kind: 'expense',
    amount: 10_001,
    occurredOn: '2026-10-10',
    description: 'Groceries',
    categoryId: null,
    paidBy: anna.id,
    split: { method: 'equal', userIds: [anna.id, ben.id] },
    ...overrides,
  };
}

function privateInput(overrides: Record<string, unknown> = {}) {
  return {
    visibility: 'private',
    kind: 'expense',
    amount: 2_500,
    occurredOn: '2026-10-09',
    description: 'Haircut',
    categoryId: null,
    ...overrides,
  };
}

async function post(user: TestUser, body: object) {
  return request(app)
    .post(base())
    .set('Authorization', await bearer(user))
    .send(body);
}

async function create(user: TestUser, body: object): Promise<Transaction> {
  const res = await post(user, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function put(user: TestUser, id: string, body: object) {
  return request(app)
    .put(base(`/${id}`))
    .set('Authorization', await bearer(user))
    .send(body);
}

async function list(user: TestUser, query: Record<string, string> = {}) {
  const res = await request(app)
    .get(base())
    .query(query)
    .set('Authorization', await bearer(user))
    .expect(200);
  return transactionListResponseSchema.parse(res.body);
}

async function history(user: TestUser, id: string) {
  const res = await request(app)
    .get(base(`/${id}/history`))
    .set('Authorization', await bearer(user))
    .expect(200);
  return transactionHistoryResponseSchema.parse(res.body).entries;
}

async function categoryId(name: string): Promise<string> {
  const res = await request(app)
    .get(`/api/households/${householdId}/categories`)
    .set('Authorization', await bearer(anna))
    .expect(200);
  const found = categoryListResponseSchema.parse(res.body).categories.find((c) => c.name === name);
  if (!found) throw new Error(`No category ${name}`);
  return found.id;
}

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
});

describe('creating', () => {
  it('splits a shared expense equally; the leftover unit goes to the first id', async () => {
    const transaction = await create(ben, sharedInput());
    const [first, second] = byId(anna, ben);

    expect(transaction).toMatchObject({
      visibility: 'shared',
      amount: 10_001,
      currency: 'HUF',
      paidBy: { userId: anna.id, displayName: 'Anna' },
      createdBy: { userId: ben.id, displayName: 'Ben' },
      version: 1,
    });
    expect(transaction.split).toEqual({
      method: 'equal',
      shares: [
        {
          userId: first,
          displayName: first === anna.id ? 'Anna' : 'Ben',
          amount: 5001,
          basisPoints: null,
        },
        {
          userId: second,
          displayName: second === anna.id ? 'Anna' : 'Ben',
          amount: 5000,
          basisPoints: null,
        },
      ],
    });
  });

  it('keeps entered percentages and fixed amounts', async () => {
    const percentage = await create(
      anna,
      sharedInput({
        amount: 12_345,
        split: {
          method: 'percentage',
          shares: [
            { userId: anna.id, basisPoints: 6000 },
            { userId: ben.id, basisPoints: 4000 },
          ],
        },
      }),
    );
    const shareOf = (t: Transaction, user: TestUser) =>
      t.split?.shares.find((s) => s.userId === user.id);
    expect(shareOf(percentage, anna)).toMatchObject({ amount: 7407, basisPoints: 6000 });
    expect(shareOf(percentage, ben)).toMatchObject({ amount: 4938, basisPoints: 4000 });

    const fixed = await create(
      anna,
      sharedInput({
        amount: 1000,
        split: {
          method: 'fixed',
          shares: [
            { userId: anna.id, amount: 300 },
            { userId: ben.id, amount: 700 },
          ],
        },
      }),
    );
    expect(shareOf(fixed, ben)).toMatchObject({ amount: 700, basisPoints: null });
  });

  it('stores private transactions without payer input or split', async () => {
    const transaction = await create(ben, { ...privateInput(), paidBy: anna.id });
    expect(transaction).toMatchObject({
      visibility: 'private',
      paidBy: { userId: ben.id },
      split: null,
    });
  });

  it('rejects splits that do not add up', async () => {
    const res = await post(
      anna,
      sharedInput({ split: { method: 'fixed', shares: [{ userId: anna.id, amount: 1 }] } }),
    );
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('only lets members pay or share', async () => {
    const outsider = await createTestUser('Eve');
    for (const body of [
      sharedInput({ paidBy: outsider.id }),
      sharedInput({ split: { method: 'equal', userIds: [anna.id, outsider.id] } }),
    ]) {
      const res = await post(anna, body);
      expect(res.status).toBe(400);
      expect(errorCode(res)).toBe('INVALID_MEMBER');
    }

    await leave(app, householdId, ben);
    const res = await post(anna, sharedInput());
    expect(errorCode(res)).toBe('INVALID_MEMBER');
  });

  it('only accepts active categories of the same kind from this household', async () => {
    const groceries = await categoryId('Groceries');
    const salary = await categoryId('Salary');
    const filed = await create(anna, sharedInput({ categoryId: groceries }));
    expect(filed.categoryId).toBe(groceries);

    const otherHousehold = await createHousehold(app, anna, 'Other');
    const foreign = categoryListResponseSchema.parse(
      (
        await request(app)
          .get(`/api/households/${otherHousehold}/categories`)
          .set('Authorization', await bearer(anna))
      ).body,
    ).categories[0]?.id;

    await request(app)
      .delete(`/api/households/${householdId}/categories/${groceries}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    for (const id of [salary, foreign, groceries]) {
      const res = await post(anna, sharedInput({ categoryId: id }));
      expect(res.status).toBe(400);
      expect(errorCode(res)).toBe('INVALID_CATEGORY');
    }
  });

  it('records who created it', async () => {
    const transaction = await create(anna, sharedInput());
    const entries = await history(ben, transaction.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'create',
      actor: { userId: anna.id, displayName: 'Anna' },
      before: null,
      after: transaction,
    });
  });
});

describe('visibility', () => {
  it('shows private transactions only to their author', async () => {
    const secret = await create(anna, privateInput());
    const shared = await create(anna, sharedInput());

    expect((await list(anna)).transactions.map((t) => t.id)).toEqual([shared.id, secret.id]);
    expect((await list(ben)).transactions.map((t) => t.id)).toEqual([shared.id]);

    for (const path of [`/${secret.id}`, `/${secret.id}/history`]) {
      const res = await request(app)
        .get(base(path))
        .set('Authorization', await bearer(ben));
      expect(res.status).toBe(404);
      expect(errorCode(res)).toBe('TRANSACTION_NOT_FOUND');
    }
    const edit = await put(ben, secret.id, { ...privateInput(), version: 1 });
    expect(edit.status).toBe(404);
    await request(app)
      .delete(base(`/${secret.id}`))
      .set('Authorization', await bearer(ben))
      .expect(404);
  });

  it('hides everything from outsiders, former members and anonymous requests', async () => {
    const transaction = await create(anna, sharedInput());
    const outsider = await createTestUser('Eve');

    const res = await request(app)
      .get(base())
      .set('Authorization', await bearer(outsider));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');

    await leave(app, householdId, ben);
    await request(app)
      .get(base(`/${transaction.id}`))
      .set('Authorization', await bearer(ben))
      .expect(404);

    await request(app).get(base()).expect(401);
    await request(app)
      .get(base('/not-a-uuid'))
      .set('Authorization', await bearer(anna))
      .expect(404);
  });
});

describe('listing', () => {
  it('pages newest first with a stable cursor, ties broken by id', async () => {
    const created: Transaction[] = [];
    for (const occurredOn of [
      '2026-10-01',
      '2026-10-03',
      '2026-10-03',
      '2026-10-02',
      '2026-10-03',
    ]) {
      created.push(await create(anna, sharedInput({ occurredOn })));
    }
    const expected = [...created]
      .sort((a, b) =>
        a.occurredOn === b.occurredOn
          ? a.id < b.id
            ? 1
            : -1
          : a.occurredOn < b.occurredOn
            ? 1
            : -1,
      )
      .map((t) => t.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await list(anna, { limit: '2', ...(cursor ? { cursor } : {}) });
      seen.push(...page.transactions.map((t) => t.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);
  });

  it('filters by month, kind, visibility, category, member and text', async () => {
    const groceries = await categoryId('Groceries');
    const september = await create(anna, sharedInput({ occurredOn: '2026-09-30' }));
    const filed = await create(
      anna,
      sharedInput({ categoryId: groceries, description: 'Market 50% off' }),
    );
    const income = await create(anna, sharedInput({ kind: 'income', description: 'Refund' }));
    const mine = await create(anna, privateInput());
    const annaOnly = await create(
      anna,
      sharedInput({ split: { method: 'equal', userIds: [anna.id] }, description: 'Anna only' }),
    );

    const ids = async (query: Record<string, string>) =>
      (await list(anna, query)).transactions.map((t) => t.id).sort();
    const sorted = (...items: Transaction[]) => items.map((t) => t.id).sort();

    expect(await ids({ month: '2026-09' })).toEqual(sorted(september));
    expect(await ids({ month: '2026-10', kind: 'income' })).toEqual(sorted(income));
    expect(await ids({ visibility: 'private' })).toEqual(sorted(mine));
    expect(await ids({ categoryId: groceries })).toEqual(sorted(filed));
    expect(await ids({ memberId: ben.id })).toEqual(sorted(september, filed, income));
    // `%` is a literal here, not a wildcard.
    expect(await ids({ q: '50%' })).toEqual(sorted(filed));
    expect(await ids({ q: 'anna ONLY' })).toEqual(sorted(annaOnly));
  });

  it('rejects a tampered cursor', async () => {
    const res = await request(app)
      .get(base())
      .query({ cursor: 'garbage' })
      .set('Authorization', await bearer(anna));
    expect(res.status).toBe(400);
  });
});

describe('month summary', () => {
  async function summary(user: TestUser, month: string) {
    const res = await request(app)
      .get(base('/summary'))
      .query({ month })
      .set('Authorization', await bearer(user))
      .expect(200);
    return transactionSummaryResponseSchema.parse(res.body).summary;
  }

  it('sums what the caller can see, and their part of the expenses', async () => {
    await create(anna, sharedInput({ amount: 10_001 })); // Anna's share 5001 or 5000
    await create(
      anna,
      sharedInput({ amount: 3000, split: { method: 'equal', userIds: [ben.id] } }),
    );
    await create(anna, privateInput({ amount: 2500 }));
    await create(ben, privateInput({ amount: 999 }));
    await create(anna, sharedInput({ kind: 'income', amount: 50_000 }));
    await create(anna, sharedInput({ occurredOn: '2026-09-30', amount: 7 }));
    const deleted = await create(anna, sharedInput({ amount: 100 }));
    await request(app)
      .delete(base(`/${deleted.id}`))
      .set('Authorization', await bearer(anna))
      .expect(204);

    const [first] = byId(anna, ben);
    const annaShare = first === anna.id ? 5001 : 5000;

    expect(await summary(anna, '2026-10')).toEqual({
      month: '2026-10',
      currency: 'HUF',
      expenses: 10_001 + 3000 + 2500,
      income: 50_000,
      yourExpenses: annaShare + 2500,
    });
    expect(await summary(ben, '2026-10')).toMatchObject({
      expenses: 10_001 + 3000 + 999,
      yourExpenses: 10_001 - annaShare + 3000 + 999,
    });
    expect((await summary(anna, '2026-09')).expenses).toBe(7);
  });

  it('needs a month', async () => {
    await request(app)
      .get(base('/summary'))
      .set('Authorization', await bearer(anna))
      .expect(400);
  });
});

describe('updating', () => {
  it('replaces the transaction, bumps the version and records before and after', async () => {
    const original = await create(anna, sharedInput());
    const res = await put(ben, original.id, {
      ...sharedInput({ amount: 3000, description: 'Groceries and wine', paidBy: ben.id }),
      version: 1,
    });
    expect(res.status).toBe(200);
    const updated = transactionResponseSchema.parse(res.body).transaction;
    expect(updated).toMatchObject({ amount: 3000, version: 2, paidBy: { userId: ben.id } });
    expect(updated.split?.shares.map((s) => s.amount)).toEqual([1500, 1500]);

    const entries = await history(anna, original.id);
    expect(entries.map((e) => e.action)).toEqual(['create', 'update']);
    expect(entries[1]).toMatchObject({
      actor: { userId: ben.id },
      before: original,
      after: updated,
    });
  });

  it('refuses a stale version, also when two edits race', async () => {
    const original = await create(anna, sharedInput());
    const edit = (user: TestUser, description: string) =>
      put(user, original.id, { ...sharedInput({ description }), version: 1 });

    const results = await Promise.all([edit(anna, 'First'), edit(ben, 'Second')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = results.find((r) => r.status === 409);
    expect(conflict && errorCode(conflict)).toBe('VERSION_CONFLICT');
  });

  it('lets only the author make a transaction private', async () => {
    const transaction = await create(anna, sharedInput());
    const res = await put(ben, transaction.id, { ...privateInput(), version: 1 });
    expect(res.status).toBe(403);

    const made = await put(anna, transaction.id, { ...privateInput(), version: 1 });
    expect(transactionResponseSchema.parse(made.body).transaction).toMatchObject({
      visibility: 'private',
      split: null,
      paidBy: { userId: anna.id },
    });
    expect(
      await db.$count(transactionSplits, eq(transactionSplits.transactionId, transaction.id)),
    ).toBe(0);
  });

  it('keeps people who left editable on old transactions, but not newly added', async () => {
    const carol = await createTestUser('Carol');
    await join(app, anna, householdId, carol);
    const old = await create(
      anna,
      sharedInput({ split: { method: 'equal', userIds: [anna.id, ben.id] } }),
    );
    await leave(app, householdId, ben);

    const fixTypo = await put(anna, old.id, {
      ...sharedInput({ description: 'Groceries!' }),
      version: 1,
    });
    expect(fixTypo.status).toBe(200);

    const swapBenForCarol = await put(anna, old.id, {
      ...sharedInput({ paidBy: anna.id, split: { method: 'equal', userIds: [anna.id, carol.id] } }),
      version: 2,
    });
    expect(swapBenForCarol.status).toBe(200);
    const readd = await put(anna, old.id, { ...sharedInput(), version: 3 });
    expect(errorCode(readd)).toBe('INVALID_MEMBER');
  });

  it('keeps an archived category the transaction already had', async () => {
    const groceries = await categoryId('Groceries');
    const transaction = await create(anna, sharedInput({ categoryId: groceries }));
    await request(app)
      .delete(`/api/households/${householdId}/categories/${groceries}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    const res = await put(anna, transaction.id, {
      ...sharedInput({ categoryId: groceries, description: 'Still groceries' }),
      version: 1,
    });
    expect(res.status).toBe(200);
  });
});

describe('deleting and restoring', () => {
  it('soft deletes, restores, and keeps the history', async () => {
    const transaction = await create(anna, sharedInput());
    await request(app)
      .delete(base(`/${transaction.id}`))
      .set('Authorization', await bearer(ben))
      .expect(204);

    expect((await list(anna)).transactions).toEqual([]);
    await request(app)
      .get(base(`/${transaction.id}`))
      .set('Authorization', await bearer(anna))
      .expect(404);
    // An edit based on the pre-delete version cannot resurrect it.
    expect((await put(anna, transaction.id, { ...sharedInput(), version: 1 })).status).toBe(404);

    const restored = await request(app)
      .post(base(`/${transaction.id}/restore`))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(transactionResponseSchema.parse(restored.body).transaction.version).toBe(3);
    expect((await list(anna)).transactions).toHaveLength(1);

    // Restoring again changes nothing.
    await request(app)
      .post(base(`/${transaction.id}/restore`))
      .set('Authorization', await bearer(anna))
      .expect(200);

    const entries = await history(anna, transaction.id);
    expect(entries.map((e) => [e.action, e.actor.userId])).toEqual([
      ['create', anna.id],
      ['delete', ben.id],
      ['restore', anna.id],
    ]);
    expect(entries[1]?.after).toBeNull();
  });
});

describe('database guarantees', () => {
  async function insertShared(amount: number, shares: { userId: string; amount: number }[]) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(transactions)
        .values({
          householdId,
          createdBy: anna.id,
          paidBy: anna.id,
          kind: 'expense',
          visibility: 'shared',
          amount,
          currency: 'HUF',
          occurredOn: '2026-10-10',
          description: 'Raw insert',
          splitMethod: 'fixed',
        })
        .returning();
      if (!row) throw new Error('no row');
      if (shares.length > 0) {
        await tx
          .insert(transactionSplits)
          .values(shares.map((s) => ({ ...s, transactionId: row.id, householdId })));
      }
      return row;
    });
  }

  it('checks at commit that splits sum to the amount', async () => {
    const ok = await insertShared(100, [
      { userId: anna.id, amount: 60 },
      { userId: ben.id, amount: 40 },
    ]);
    expect(ok.amount).toBe(100);

    for (const shares of [[{ userId: anna.id, amount: 99 }], []]) {
      expect(await pgErrorOf(insertShared(100, shares))).toMatchObject({
        code: '23514',
        constraint: 'transaction_splits_sum_matches',
      });
    }

    // Changing the amount alone breaks the sum too.
    expect(
      await pgErrorOf(
        db.update(transactions).set({ amount: 101 }).where(eq(transactions.id, ok.id)),
      ),
    ).toMatchObject({ constraint: 'transaction_splits_sum_matches' });
  });

  it('rejects private transactions paid by someone else, and cross-household shares', async () => {
    expect(
      await pgErrorOf(
        db.insert(transactions).values({
          householdId,
          createdBy: anna.id,
          paidBy: ben.id,
          kind: 'expense',
          visibility: 'private',
          amount: 100,
          currency: 'HUF',
          occurredOn: '2026-10-10',
          description: 'Not mine',
        }),
      ),
    ).toMatchObject({ code: '23514', constraint: 'transactions_private_paid_by_author' });

    const outsider = await createTestUser('Eve');
    await createHousehold(app, outsider, 'Elsewhere');
    expect(
      await pgErrorOf(insertShared(100, [{ userId: outsider.id, amount: 100 }])),
    ).toMatchObject({
      code: '23503',
      constraint: 'transaction_splits_member_fk',
    });
  });

  it('rejects a category of the other kind', async () => {
    const salary = await categoryId('Salary');
    expect(
      await pgErrorOf(
        db.insert(transactions).values({
          householdId,
          createdBy: anna.id,
          paidBy: anna.id,
          kind: 'expense',
          visibility: 'private',
          amount: 100,
          currency: 'HUF',
          occurredOn: '2026-10-10',
          description: 'Wrong kind',
          categoryId: salary,
        }),
      ),
    ).toMatchObject({ code: '23503', constraint: 'transactions_category_fk' });
  });
});
