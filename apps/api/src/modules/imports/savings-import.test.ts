import {
  apiErrorResponseSchema,
  importCheckResponseSchema,
  importListResponseSchema,
  importResponseSchema,
  type SavingsGoal,
  savingsEntryListResponseSchema,
  savingsGoalResponseSchema,
  transactionListResponseSchema,
  transactionResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { savingsEntries, transactions } from '../../db/schema';

let app: App;
let anna: TestUser;
let ben: TestUser;
let householdId: string;

const base = (path = '') => `/api/households/${householdId}${path}`;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  ben = await createTestUser('Ben');
  householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
});

async function createGoal(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(base('/savings'))
    .set('Authorization', await bearer(user))
    .send({
      name: 'Holiday',
      targetAmount: 600_000,
      targetDate: null,
      visibility: 'shared',
      ...overrides,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return savingsGoalResponseSchema.parse(res.body).goal;
}

async function getGoal(user: TestUser, goal: SavingsGoal) {
  const res = await request(app)
    .get(base(`/savings/${goal.id}`))
    .set('Authorization', await bearer(user))
    .expect(200);
  return savingsGoalResponseSchema.parse(res.body).goal;
}

async function addEntry(user: TestUser, goal: SavingsGoal, amount: number, entryOn = '2026-09-02') {
  const res = await request(app)
    .post(base(`/savings/${goal.id}/entries`))
    .set('Authorization', await bearer(user))
    .send({ amount, entryOn, note: null });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function entries(user: TestUser, goal: SavingsGoal) {
  const res = await request(app)
    .get(base(`/savings/${goal.id}/entries`))
    .set('Authorization', await bearer(user))
    .expect(200);
  return savingsEntryListResponseSchema.parse(res.body).entries;
}

/** A pocket transfer as the web app sends it: money out of the account into the goal. */
function savingsRow(
  fingerprint: string,
  goal: SavingsGoal,
  overrides: Record<string, unknown> = {},
) {
  return {
    fingerprint,
    savings: {
      goalId: goal.id,
      kind: 'expense',
      amount: 50_000,
      entryOn: '2026-09-01',
      note: 'To Holiday pocket',
      ...overrides,
    },
  };
}

function transactionRow(fingerprint: string) {
  return {
    fingerprint,
    counterparty: 'TESCO 44049',
    transaction: {
      visibility: 'private',
      kind: 'expense',
      amount: 2306,
      occurredOn: '2026-09-01',
      description: 'Tesco',
      categoryId: null,
    },
  };
}

async function postImport(user: TestUser, rows: object[]) {
  return request(app)
    .post(base('/imports'))
    .set('Authorization', await bearer(user))
    .send({ source: 'revolut', fileName: 'export.csv', rows });
}

async function importRows(user: TestUser, rows: object[]) {
  const res = await postImport(user, rows);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return importResponseSchema.parse(res.body);
}

async function check(user: TestUser, rows: object[]) {
  const res = await request(app)
    .post(base('/imports/check'))
    .set('Authorization', await bearer(user))
    .send({ rows });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return importCheckResponseSchema.parse(res.body).rows;
}

const checkRow = (fingerprint: string, overrides: Record<string, unknown> = {}) => ({
  fingerprint,
  occurredOn: '2026-09-01',
  kind: 'expense',
  amount: 50_000,
  ...overrides,
});

const undo = async (user: TestUser, importId: string) =>
  request(app)
    .delete(base(`/imports/${importId}`))
    .set('Authorization', await bearer(user));

describe('importing rows to savings', () => {
  it('records money out as a deposit and money in as a withdrawal, never as a transaction', async () => {
    const goal = await createGoal(anna);
    const { batch, skipped } = await importRows(anna, [
      transactionRow('rev:1'),
      savingsRow('rev:2', goal),
      savingsRow('rev:3', goal, { kind: 'income', amount: 20_000, entryOn: '2026-09-05' }),
    ]);

    expect(skipped).toBe(0);
    expect(batch).toMatchObject({ rowCount: 1, savingsCount: 2 });
    expect((await getGoal(anna, goal)).balance).toBe(30_000);
    expect(
      (await entries(anna, goal)).map(({ amount, entryOn, note, user }) => ({
        amount,
        entryOn,
        note,
        user: user.displayName,
      })),
    ).toEqual([
      { amount: -20_000, entryOn: '2026-09-05', note: 'To Holiday pocket', user: 'Anna' },
      { amount: 50_000, entryOn: '2026-09-01', note: 'To Holiday pocket', user: 'Anna' },
    ]);

    const list = await request(app)
      .get(base('/transactions'))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(
      transactionListResponseSchema.parse(list.body).transactions.map((t) => t.description),
    ).toEqual(['Tesco']);

    const stored = await db.select().from(savingsEntries);
    expect(stored.every((entry) => entry.importBatchId === batch.id)).toBe(true);
    expect(stored.map((entry) => entry.importFingerprint).sort()).toEqual(['rev:2', 'rev:3']);
  });

  it('imports a file that lists a withdrawal before the deposit it takes from', async () => {
    const goal = await createGoal(anna);
    const { batch } = await importRows(anna, [
      savingsRow('rev:1', goal, { kind: 'income', amount: 30_000, entryOn: '2026-09-08' }),
      savingsRow('rev:2', goal, { entryOn: '2026-09-01' }),
    ]);
    expect(batch).toMatchObject({ rowCount: 0, savingsCount: 2 });
    expect((await getGoal(anna, goal)).balance).toBe(20_000);
  });

  it('refuses the whole import, naming the row, for a withdrawal the goal does not hold', async () => {
    const goal = await createGoal(anna);
    const res = await postImport(anna, [
      transactionRow('rev:1'),
      savingsRow('rev:2', goal, { amount: 10_000 }),
      savingsRow('rev:3', goal, { kind: 'income', amount: 10_001 }),
    ]);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('INSUFFICIENT_SAVINGS');
    const { error } = apiErrorResponseSchema.parse(res.body);
    expect(error.message).toMatch(/^Row 3: /);
    expect(error.details).toEqual({ row: 3 });
    expect(await db.$count(transactions)).toBe(0);
    expect(await db.$count(savingsEntries)).toBe(0);
  });

  it('refuses a goal the importer cannot see, and a closed one', async () => {
    const bike = await createGoal(ben, { name: 'Bike', visibility: 'private' });
    const hidden = await postImport(anna, [transactionRow('rev:1'), savingsRow('rev:2', bike)]);
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden)).toBe('SAVINGS_GOAL_NOT_FOUND');
    expect(apiErrorResponseSchema.parse(hidden.body).error.details).toEqual({ row: 2 });

    const closed = await createGoal(anna);
    await request(app)
      .post(base(`/savings/${closed.id}/archive`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    const res = await postImport(anna, [savingsRow('rev:3', closed)]);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('SAVINGS_GOAL_ARCHIVED');
    expect(await db.$count(transactions)).toBe(0);
  });

  it('skips a bank row the importer already has, as a transaction or an entry', async () => {
    const goal = await createGoal(anna);
    await importRows(anna, [transactionRow('rev:1'), savingsRow('rev:2', goal)]);

    const again = await importRows(anna, [
      savingsRow('rev:1', goal),
      transactionRow('rev:2'),
      savingsRow('rev:3', goal),
      savingsRow('rev:3', goal),
    ]);
    expect(again).toMatchObject({ skipped: 3, batch: { rowCount: 0, savingsCount: 1 } });

    const nothing = await postImport(anna, [savingsRow('rev:2', goal)]);
    expect(nothing.status).toBe(409);
    expect(errorCode(nothing)).toBe('NOTHING_TO_IMPORT');

    // Fingerprints are per person: Ben's copy of the row is his.
    expect((await importRows(ben, [savingsRow('rev:2', goal)])).batch.savingsCount).toBe(1);
  });

  it('lists the savings count with the importer’s imports', async () => {
    const goal = await createGoal(anna);
    await importRows(anna, [transactionRow('rev:1'), savingsRow('rev:2', goal)]);
    const res = await request(app)
      .get(base('/imports'))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(importListResponseSchema.parse(res.body).batches).toMatchObject([
      { rowCount: 1, savingsCount: 1 },
    ]);
  });
});

describe('checking rows against savings', () => {
  it('tells imported, undone and deleted entries apart and names the goal', async () => {
    const goal = await createGoal(anna);
    const first = await importRows(anna, [savingsRow('rev:1', goal)]);
    await undo(anna, first.batch.id);
    await importRows(anna, [savingsRow('rev:2', goal, { entryOn: '2026-09-03' })]);
    await importRows(anna, [savingsRow('rev:3', goal, { entryOn: '2026-09-04' })]);
    const [own] = (await entries(anna, goal)).filter((entry) => entry.entryOn === '2026-09-04');
    await request(app)
      .delete(base(`/savings/${goal.id}/entries/${own?.id ?? ''}`))
      .set('Authorization', await bearer(anna))
      .expect(204);

    const results = await check(anna, [checkRow('rev:1'), checkRow('rev:2'), checkRow('rev:3')]);
    expect(results.map((r) => r.status)).toEqual(['undone', 'imported', 'deleted']);
    expect(results[1]?.match).toMatchObject({
      description: 'Holiday',
      occurredOn: '2026-09-03',
      goalId: goal.id,
    });
    // Ben has none of them.
    expect((await check(ben, [checkRow('rev:2')]))[0]?.status).toBe('new');
  });

  it('matches entries the caller recorded by hand, by direction, within two days', async () => {
    const goal = await createGoal(anna);
    await addEntry(anna, goal, 50_000, '2026-09-02');
    await addEntry(anna, goal, -20_000, '2026-09-10');
    // Ben's hand entry is not Anna's duplicate.
    await addEntry(ben, goal, 7_000, '2026-09-01');

    const results = await check(anna, [
      checkRow('rev:1'),
      checkRow('rev:2'),
      checkRow('rev:3', { kind: 'income', amount: 20_000, occurredOn: '2026-09-09' }),
      checkRow('rev:4', { amount: 20_000, occurredOn: '2026-09-10' }),
      checkRow('rev:5', { amount: 7_000 }),
    ]);
    expect(results.map((r) => [r.status, r.match?.goalId ?? null])).toEqual([
      ['possible-duplicate', goal.id],
      // One hand entry matches one row.
      ['new', null],
      ['possible-duplicate', goal.id],
      // A withdrawal is no match for money going out.
      ['new', null],
      ['new', null],
    ]);
  });

  it('prefers a hand-entered transaction to an entry on the same day', async () => {
    const goal = await createGoal(anna);
    await addEntry(anna, goal, 50_000, '2026-09-01');
    const tx = await request(app)
      .post(base('/transactions'))
      .set('Authorization', await bearer(anna))
      .send({
        visibility: 'private',
        kind: 'expense',
        amount: 50_000,
        occurredOn: '2026-09-01',
        description: 'Flights',
        categoryId: null,
      })
      .expect(201);
    const [first, second] = await check(anna, [checkRow('rev:1'), checkRow('rev:2')]);
    const { transaction } = transactionResponseSchema.parse(tx.body);
    expect(first?.match).toMatchObject({ id: transaction.id, goalId: null });
    expect(second?.match).toMatchObject({ description: 'Holiday', goalId: goal.id });
  });
});

describe('undoing an import with savings', () => {
  it('removes its entries with the transactions, so the rows can come back', async () => {
    const goal = await createGoal(anna);
    const { batch } = await importRows(anna, [
      transactionRow('rev:1'),
      savingsRow('rev:2', goal),
      savingsRow('rev:3', goal, { kind: 'income', amount: 5_000 }),
    ]);
    expect((await undo(anna, batch.id)).status).toBe(204);
    expect((await getGoal(anna, goal)).balance).toBe(0);
    const stored = await db.select().from(savingsEntries);
    expect(new Set(stored.map((entry) => entry.deletedAt?.getTime()))).toEqual(
      new Set([(await db.query.importBatches.findFirst())?.undoneAt?.getTime()]),
    );

    expect((await importRows(anna, [savingsRow('rev:2', goal)])).batch.savingsCount).toBe(1);
  });

  it('refuses when the money was taken out since, and changes nothing', async () => {
    const goal = await createGoal(anna);
    const { batch } = await importRows(anna, [transactionRow('rev:1'), savingsRow('rev:2', goal)]);
    await addEntry(ben, goal, 10_000);
    await addEntry(ben, goal, -55_000);

    const res = await undo(anna, batch.id);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('INSUFFICIENT_SAVINGS');
    expect((await getGoal(anna, goal)).balance).toBe(5_000);
    const [txRow] = await db.select().from(transactions);
    expect(txRow?.deletedAt).toBeNull();
    expect((await db.query.importBatches.findFirst())?.undoneAt).toBeNull();
  });

  it('corrects a goal closed since', async () => {
    const goal = await createGoal(anna);
    const { batch } = await importRows(anna, [savingsRow('rev:1', goal)]);
    await request(app)
      .post(base(`/savings/${goal.id}/archive`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    expect((await undo(anna, batch.id)).status).toBe(204);
    expect((await getGoal(anna, goal)).balance).toBe(0);
  });
});

describe('database-level protection for imported entries', () => {
  it('keeps the batch and the fingerprint together (CHECK)', async () => {
    const goal = await createGoal(anna);
    const error = await pgErrorOf(
      db.insert(savingsEntries).values({
        householdId,
        goalId: goal.id,
        userId: anna.id,
        amount: 100,
        entryOn: '2026-09-01',
        importFingerprint: 'rev:1',
      }),
    );
    expect(error).toMatchObject({ code: '23514', constraint: 'savings_entries_import_consistent' });
  });

  it('allows one live entry per bank row and person (unique index)', async () => {
    const goal = await createGoal(anna);
    const { batch } = await importRows(anna, [savingsRow('rev:1', goal)]);
    const twin = {
      householdId,
      goalId: goal.id,
      userId: anna.id,
      amount: 100,
      entryOn: '2026-09-01',
      importBatchId: batch.id,
      importFingerprint: 'rev:1',
    };
    const error = await pgErrorOf(db.insert(savingsEntries).values(twin));
    expect(error).toMatchObject({
      code: '23505',
      constraint: 'savings_entries_import_fingerprint_unique',
    });
    // A deleted one does not count.
    await db
      .update(savingsEntries)
      .set({ deletedAt: new Date() })
      .where(eq(savingsEntries.goalId, goal.id));
    await db.insert(savingsEntries).values(twin);
  });
});
