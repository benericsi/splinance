import {
  apiErrorResponseSchema,
  categoryListResponseSchema,
  importCheckResponseSchema,
  importListResponseSchema,
  importResponseSchema,
  transactionListResponseSchema,
  transactionResponseSchema,
} from '@splinance/shared';
import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { auditLog, importBatches, transactions } from '../../db/schema';

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

/** A bank row as the web app sends it: private expense of the importer by default. */
function row(fingerprint: string, overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    },
  };
}

const checkRow = (fingerprint: string, overrides: Record<string, unknown> = {}) => ({
  fingerprint,
  occurredOn: '2026-09-01',
  kind: 'expense',
  amount: 2306,
  ...overrides,
});

async function check(user: TestUser, rows: object[]) {
  const res = await request(app)
    .post(base('/imports/check'))
    .set('Authorization', await bearer(user))
    .send({ rows });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return importCheckResponseSchema.parse(res.body).rows;
}

async function postImport(user: TestUser, rows: object[], fileName: string | null = 'export.csv') {
  return request(app)
    .post(base('/imports'))
    .set('Authorization', await bearer(user))
    .send({ source: 'kh', fileName, rows });
}

async function importRows(user: TestUser, rows: object[]) {
  const res = await postImport(user, rows);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return importResponseSchema.parse(res.body);
}

async function undo(user: TestUser, importId: string) {
  return request(app)
    .delete(base(`/imports/${importId}`))
    .set('Authorization', await bearer(user));
}

async function manual(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(base('/transactions'))
    .set('Authorization', await bearer(user))
    .send({
      visibility: 'private',
      kind: 'expense',
      amount: 2306,
      occurredOn: '2026-08-31',
      description: 'Groceries',
      categoryId: null,
      ...overrides,
    })
    .expect(201);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function listTransactions(user: TestUser) {
  const res = await request(app)
    .get(base('/transactions'))
    .set('Authorization', await bearer(user))
    .expect(200);
  return transactionListResponseSchema.parse(res.body).transactions;
}

describe('POST /imports', () => {
  it('creates the transactions with their origin and counts them on the batch', async () => {
    const { batch, skipped } = await importRows(anna, [
      row('kh:1'),
      row('kh:2', {
        visibility: 'shared',
        description: 'Pizza',
        amount: 6000,
        paidBy: anna.id,
        split: { method: 'equal', userIds: [anna.id, ben.id] },
      }),
    ]);
    expect(skipped).toBe(0);
    expect(batch).toMatchObject({
      source: 'kh',
      fileName: 'export.csv',
      rowCount: 2,
      createdBy: { userId: anna.id, displayName: 'Anna' },
      undoneAt: null,
    });

    const listed = await listTransactions(anna);
    expect(listed.map((t) => [t.description, t.counterparty, t.importBatchId])).toEqual(
      expect.arrayContaining([
        ['Tesco', 'TESCO 44049', batch.id],
        ['Pizza', 'TESCO 44049', batch.id],
      ]),
    );
    // Ben sees the shared one only, with his share.
    const forBen = await listTransactions(ben);
    expect(forBen.map((t) => t.description)).toEqual(['Pizza']);

    const created = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entity, 'transaction'));
    expect(created).toHaveLength(2);
  });

  it('skips rows the caller already has, also repeated in one request', async () => {
    await importRows(anna, [row('kh:1')]);
    const { batch, skipped } = await importRows(anna, [row('kh:1'), row('kh:2'), row('kh:2')]);
    expect(skipped).toBe(2);
    expect(batch.rowCount).toBe(1);

    const nothing = await postImport(anna, [row('kh:1'), row('kh:2')]);
    expect(nothing.status).toBe(409);
    expect(errorCode(nothing)).toBe('NOTHING_TO_IMPORT');
  });

  it('keeps fingerprints per person', async () => {
    await importRows(anna, [row('kh:1')]);
    const { skipped } = await importRows(ben, [row('kh:1')]);
    expect(skipped).toBe(0);
  });

  it('fails as a whole and names the row the transaction rules refuse', async () => {
    const res = await postImport(anna, [
      row('kh:1'),
      row('kh:2', {
        visibility: 'shared',
        paidBy: anna.id,
        split: { method: 'equal', userIds: [anna.id, '01a1216a-b248-781c-9cc6-cd68276fcdfc'] },
      }),
    ]);
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('INVALID_MEMBER');
    expect(apiErrorResponseSchema.parse(res.body).error.message).toMatch(/^Row 2: /);
    expect(await db.$count(importBatches)).toBe(0);
    expect(await db.$count(transactions)).toBe(0);
  });

  it('accepts a full thousand rows, past the usual body limit', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      row(
        `revolut:Folyószámla|2026-09-01 10:00:00|-2306.00|A rather long merchant name #${String(i)}`,
      ),
    );
    expect(JSON.stringify({ rows }).length).toBeGreaterThan(100 * 1024);
    const { batch } = await importRows(anna, rows);
    expect(batch.rowCount).toBe(1000);
  }, 60_000);

  it('validates the body and hides the household from outsiders', async () => {
    const empty = await postImport(anna, []);
    expect(empty.status).toBe(400);
    const badSource = await request(app)
      .post(base('/imports'))
      .set('Authorization', await bearer(anna))
      .send({ source: 'otp', fileName: null, rows: [row('x')] });
    expect(badSource.status).toBe(400);

    const outsider = await createTestUser('Eve');
    const res = await postImport(outsider, [row('kh:1')]);
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
  });

  it('uses categories like any transaction', async () => {
    const res = await request(app)
      .get(base('/categories'))
      .set('Authorization', await bearer(anna))
      .expect(200);
    const { categories } = categoryListResponseSchema.parse(res.body);
    const groceries = categories.find((c) => c.kind === 'expense');
    const salary = categories.find((c) => c.kind === 'income');
    await importRows(anna, [row('kh:1', { categoryId: groceries?.id })]);
    const wrongKind = await postImport(anna, [row('kh:2', { categoryId: salary?.id })]);
    expect(errorCode(wrongKind)).toBe('INVALID_CATEGORY');
  });
});

describe('POST /imports/check', () => {
  it('tells new, imported, undone and deleted rows apart', async () => {
    const first = await importRows(anna, [row('kh:1'), row('kh:2')]);
    expect((await check(anna, [checkRow('kh:1'), checkRow('kh:9')])).map((r) => r.status)).toEqual([
      'imported',
      'new',
    ]);

    // A single delete means "not wanted"; an undone import means "import it again".
    const [one] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.importFingerprint, 'kh:1'));
    await request(app)
      .delete(base(`/transactions/${one?.id ?? ''}`))
      .set('Authorization', await bearer(anna))
      .expect(204);
    expect((await undo(anna, first.batch.id)).status).toBe(204);

    const results = await check(anna, [checkRow('kh:1'), checkRow('kh:2')]);
    expect(results.map((r) => r.status)).toEqual(['deleted', 'undone']);
    expect(results[0]?.match).toMatchObject({ description: 'Tesco', occurredOn: '2026-09-01' });

    // Imported again after the undo: imported wins.
    await importRows(anna, [row('kh:2')]);
    expect((await check(anna, [checkRow('kh:2')]))[0]?.status).toBe('imported');
  });

  it('only sees the caller’s own imports', async () => {
    await importRows(ben, [row('kh:1')]);
    expect((await check(anna, [checkRow('kh:1')]))[0]?.status).toBe('new');
  });

  it('matches hand-entered transactions the caller paid, one row each, within two days', async () => {
    const groceries = await manual(anna);
    await manual(anna, { amount: 999, description: 'Other amount' });
    await manual(anna, { kind: 'income', description: 'Refund', occurredOn: '2026-09-01' });
    // Ben paid this one: not Anna's bank row.
    await manual(ben, { description: 'Bens groceries' });

    const results = await check(anna, [
      checkRow('a', { occurredOn: '2026-09-02' }),
      checkRow('b', { occurredOn: '2026-09-02' }),
      checkRow('c', { occurredOn: '2026-09-04' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['possible-duplicate', 'new', 'new']);
    expect(results[0]?.match).toEqual({
      id: groceries.id,
      description: 'Groceries',
      occurredOn: '2026-08-31',
    });
  });

  it('accepts up to a thousand rows', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => checkRow(`kh:${String(i)}`));
    const res = await request(app)
      .post(base('/imports/check'))
      .set('Authorization', await bearer(anna))
      .send({ rows });
    expect(res.status).toBe(400);
    expect(await check(anna, rows.slice(0, 1000))).toHaveLength(1000);
  });
});

describe('GET /imports and DELETE /imports/:id', () => {
  it('lists the caller’s own imports, newest first', async () => {
    const first = await importRows(anna, [row('kh:1')]);
    const second = await importRows(anna, [row('kh:2')]);
    await importRows(ben, [row('kh:3')]);

    const res = await request(app)
      .get(base('/imports'))
      .set('Authorization', await bearer(anna))
      .expect(200);
    expect(importListResponseSchema.parse(res.body).batches.map((b) => b.id)).toEqual([
      second.batch.id,
      first.batch.id,
    ]);
  });

  it('undoes every transaction of the import, edited ones too, once', async () => {
    const { batch } = await importRows(anna, [row('kh:1'), row('kh:2')]);
    const [edited] = await listTransactions(anna);
    await request(app)
      .put(base(`/transactions/${edited?.id ?? ''}`))
      .set('Authorization', await bearer(anna))
      .send({
        visibility: 'private',
        kind: 'expense',
        amount: 2306,
        occurredOn: '2026-09-01',
        description: 'Renamed',
        categoryId: null,
        version: 1,
      })
      .expect(200);

    expect((await undo(anna, batch.id)).status).toBe(204);
    expect(await listTransactions(anna)).toEqual([]);
    expect((await undo(anna, batch.id)).status).toBe(204);

    const [stored] = await db.select().from(importBatches).where(eq(importBatches.id, batch.id));
    expect(stored?.undoneAt).toBeInstanceOf(Date);
    const deletes = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'transaction'), eq(auditLog.action, 'delete')))
      .orderBy(asc(auditLog.createdAt));
    expect(deletes).toHaveLength(2);
  });

  it('lets only the importer undo', async () => {
    const { batch } = await importRows(anna, [row('kh:1')]);
    const asBen = await undo(ben, batch.id);
    expect(asBen.status).toBe(404);
    expect(errorCode(asBen)).toBe('IMPORT_NOT_FOUND');
    expect((await undo(anna, 'not-a-uuid')).status).toBe(404);
  });

  it('refuses to restore a row that was imported again since', async () => {
    const { batch } = await importRows(anna, [row('kh:1')]);
    const [original] = await db.select({ id: transactions.id }).from(transactions);
    await undo(anna, batch.id);
    await importRows(anna, [row('kh:1')]);

    const res = await request(app)
      .post(base(`/transactions/${original?.id ?? ''}/restore`))
      .set('Authorization', await bearer(anna));
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ALREADY_IMPORTED');
  });
});

describe('database-level protection', () => {
  it('keeps the batch and the fingerprint together (CHECK)', async () => {
    const error = await pgErrorOf(
      db.insert(transactions).values({
        householdId,
        createdBy: anna.id,
        paidBy: anna.id,
        kind: 'expense',
        visibility: 'private',
        amount: 100,
        currency: 'HUF',
        occurredOn: '2026-09-01',
        description: 'Orphan',
        importFingerprint: 'kh:1',
      }),
    );
    expect(error).toMatchObject({ code: '23514', constraint: 'transactions_import_consistent' });
  });

  it('allows one live transaction per bank row and person (unique index)', async () => {
    const { batch } = await importRows(anna, [row('kh:1')]);
    const error = await pgErrorOf(
      db.insert(transactions).values({
        householdId,
        createdBy: anna.id,
        paidBy: anna.id,
        kind: 'expense',
        visibility: 'private',
        amount: 100,
        currency: 'HUF',
        occurredOn: '2026-09-01',
        description: 'Twin',
        importBatchId: batch.id,
        importFingerprint: 'kh:1',
      }),
    );
    expect(error).toMatchObject({
      code: '23505',
      constraint: 'transactions_import_fingerprint_unique',
    });
  });
});
