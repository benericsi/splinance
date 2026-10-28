import {
  categoryListResponseSchema,
  householdResponseSchema,
  importResponseSchema,
  ruleApplyResponseSchema,
  ruleResponseSchema,
  settlementResponseSchema,
  transactionResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../test/db';
import { type App, createHousehold, join } from '../../test/households';
import { bearer, createTestUser, type TestUser } from '../../test/users';
import { createApp } from '../app';
import { createSandbox, deleteDemo } from '../modules/demo/demo.service';
import { db, pool } from './client';
import { transactions } from './schema';

/**
 * The data track's read contract (migration 0013): what the read-only role may see, the
 * columns D5 codes against, and which rows and text stay out of the lake.
 */

const READER = 'splinance_analytics_reader';
const TODAY = '2026-10-28';

// node-postgres returns bigint (amounts) as strings.
type Row = Record<string, unknown>;

let app: App;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

/** Runs a query as the read-only role (SET ROLE needs no login or password). */
async function asReader(text: string, values: unknown[] = []): Promise<Row[]> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${READER}`);
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.query('rollback');
    client.release();
  }
}

/** The Postgres error code a query as the reader fails with. */
async function readerError(text: string): Promise<string | undefined> {
  try {
    await asReader(text);
  } catch (err) {
    return (err as { code?: string }).code;
  }
  throw new Error('Expected the query to fail');
}

async function view(name: string, where = 'true', values: readonly unknown[] = []): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `select * from analytics.${name} where ${where} order by created_at`,
    [...values],
  );
  return rows;
}

async function splitsOf(transactionId: string): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    'select * from analytics.transaction_splits where transaction_id = $1 order by user_id',
    [transactionId],
  );
  return rows;
}

/** The transactions an import created, as the views show them. */
const importedBy = (batchId: string) =>
  view(
    'transactions',
    'transaction_id in (select id from public.transactions where import_batch_id = $1)',
    [batchId],
  );

async function transactionRow(id: string): Promise<Row> {
  const [row] = await view('transactions', 'transaction_id = $1', [id]);
  if (!row) throw new Error(`No analytics row for transaction ${id}`);
  return row;
}

const changedAt = (row: Row) => (row.updated_at as Date).getTime();

/** A visitor of a sandbox as a test user (for bearer tokens). */
const asUser = (user: { id: string; displayName: string }): TestUser => ({
  id: user.id,
  displayName: user.displayName,
});

const shared = (payer: TestUser, people: TestUser[], overrides: Row = {}) => ({
  visibility: 'shared',
  kind: 'expense',
  amount: 10_000,
  occurredOn: '2026-10-01',
  description: 'Typed by a visitor',
  categoryId: null,
  paidBy: payer.id,
  split: { method: 'equal', userIds: people.map((p) => p.id) },
  ...overrides,
});

async function addTransaction(householdId: string, user: TestUser, body: object) {
  const res = await request(app)
    .post(`/api/households/${householdId}/transactions`)
    .set('Authorization', await bearer(user))
    .send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function updateTransaction(
  householdId: string,
  user: TestUser,
  id: string,
  body: object,
  version: number,
) {
  const res = await request(app)
    .put(`/api/households/${householdId}/transactions/${id}`)
    .set('Authorization', await bearer(user))
    .send({ ...body, version });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return transactionResponseSchema.parse(res.body).transaction;
}

async function importShared(householdId: string, user: TestUser, fingerprint: string) {
  const res = await request(app)
    .post(`/api/households/${householdId}/imports`)
    .set('Authorization', await bearer(user))
    .send({
      source: 'kh',
      fileName: 'my-real-statement.csv',
      rows: [
        {
          fingerprint,
          counterparty: 'TESCO 44049',
          transaction: { ...shared(user, [user]), description: 'Tesco' },
        },
      ],
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return importResponseSchema.parse(res.body).batch;
}

/** Anna and Ben share a household that is not a demo's (as on production). */
async function plainHousehold() {
  const anna = await createTestUser('Anna');
  const ben = await createTestUser('Ben');
  const householdId = await createHousehold(app, anna);
  await join(app, anna, householdId, ben);
  return { anna, ben, householdId };
}

describe('the reader role', () => {
  it('can read every analytics view and no table', async () => {
    const { rows: relations } = await pool.query<{
      name: string;
      kind: string;
      options: string[] | null;
      readable: boolean;
    }>(
      `select c.relname as name, c.relkind as kind, c.reloptions as options,
              has_table_privilege($1, c.oid, 'SELECT') as readable
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'analytics'`,
      [READER],
    );
    expect(relations.length).toBeGreaterThanOrEqual(10);
    for (const relation of relations) {
      expect(relation, relation.name).toMatchObject({ kind: 'v', readable: true });
      expect(relation.options, relation.name).toContain('security_barrier=true');
    }

    // Every table of the app and of the migrator, including any added later.
    const { rows: tables } = await pool.query<{ name: string; privileged: boolean }>(
      `select n.nspname || '.' || c.relname as name,
              has_table_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
                as privileged
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'drizzle') and c.relkind in ('r', 'p', 'v', 'm')`,
      [READER],
    );
    expect(tables.length).toBeGreaterThan(10);
    expect(tables.filter((t) => t.privileged)).toEqual([]);

    expect(await asReader('select count(*) from analytics.transactions')).toHaveLength(1);
    expect(await readerError('select * from public.users')).toBe('42501');
    expect(await readerError('select * from drizzle.__drizzle_migrations')).toBe('42501');
    expect(
      await readerError(
        "insert into analytics.members (household_id, user_id, role) values (uuidv7(), uuidv7(), 'owner')",
      ),
    ).toBe('42501');
  });

  it('views are empty outside demo and test databases', async () => {
    // Can only run on a _test database, so check that every view carries the guard
    // (transaction_splits reads it through analytics.transactions).
    const { rows } = await pool.query<{ name: string; definition: string }>(
      `select viewname as name, definition from pg_views where schemaname = 'analytics'`,
    );
    for (const { name, definition } of rows) {
      const guarded =
        definition.includes('current_database()') || definition.includes('analytics.transactions');
      expect(guarded, name).toBe(true);
    }
  });
});

describe('the contract', () => {
  it('has exactly the columns the extract codes against', async () => {
    const { rows } = await pool.query<{ view: string; column: string }>(
      `select table_name as view, column_name || ' ' || udt_name as column
       from information_schema.columns where table_schema = 'analytics'
       order by table_name, ordinal_position`,
    );
    const columns: Record<string, string[]> = {};
    for (const row of rows) (columns[row.view] ??= []).push(row.column);

    expect(columns).toEqual({
      budgets: [
        'budget_id uuid',
        'household_id uuid',
        'category_id uuid',
        'user_id uuid',
        'starts_on date',
        'amount int8',
        'created_by uuid',
        'created_at timestamptz',
        'updated_at timestamptz',
        'origin text',
      ],
      categories: [
        'category_id uuid',
        'household_id uuid',
        'name text',
        'kind category_kind',
        'icon text',
        'color text',
        'archived_at timestamptz',
        'created_at timestamptz',
        'updated_at timestamptz',
        'origin text',
      ],
      demos: [
        'demo_id uuid',
        'household_id uuid',
        'visitor_id uuid',
        'partner_id uuid',
        'seed int4',
        'anchor_on date',
        'created_at timestamptz',
        'seeded_at timestamptz',
        'expires_at timestamptz',
      ],
      households: [
        'household_id uuid',
        'name text',
        'base_currency currency',
        'created_by uuid',
        'archived_at timestamptz',
        'created_at timestamptz',
        'updated_at timestamptz',
        'origin text',
      ],
      import_batches: [
        'import_batch_id uuid',
        'household_id uuid',
        'created_by uuid',
        'source import_source',
        'row_count int4',
        'undone_at timestamptz',
        'created_at timestamptz',
        'changed_at timestamptz',
        'origin text',
      ],
      members: [
        'household_id uuid',
        'user_id uuid',
        'role household_role',
        'joined_at timestamptz',
        'left_at timestamptz',
      ],
      settlements: [
        'settlement_id uuid',
        'household_id uuid',
        'from_user_id uuid',
        'to_user_id uuid',
        'amount int8',
        'currency currency',
        'settled_on date',
        'note text',
        'created_by uuid',
        'deleted_at timestamptz',
        'created_at timestamptz',
        'updated_at timestamptz',
        'origin text',
      ],
      transaction_splits: [
        'transaction_id uuid',
        'household_id uuid',
        'user_id uuid',
        'amount int8',
        'basis_points int4',
        'transaction_updated_at timestamptz',
        'occurred_on date',
      ],
      transactions: [
        'transaction_id uuid',
        'household_id uuid',
        'visibility transaction_visibility',
        'redacted bool',
        'origin text',
        'kind category_kind',
        'amount int8',
        'currency currency',
        'occurred_on date',
        'category_id uuid',
        'split_method split_method',
        'paid_by uuid',
        'created_by uuid',
        'import_batch_id uuid',
        'description text',
        'counterparty text',
        'import_fingerprint text',
        'version int4',
        'deleted_at timestamptz',
        'created_at timestamptz',
        'updated_at timestamptz',
      ],
      users: ['user_id uuid', 'display_name text', 'created_at timestamptz'],
    });
    const leaky = rows.filter((r) => /email|password|token|hash|file_name|pattern/.test(r.column));
    expect(leaky).toEqual([]);
  });
});

describe('free text and stubs in a sandbox', { timeout: 60_000 }, () => {
  it('shows the text the story wrote and hides what the visitor typed', async () => {
    const sandbox = await createSandbox({ ttlDays: 7, maxActive: 200 }, { today: TODAY, seed: 7 });
    const householdId = sandbox.householdId;
    const visitor = asUser(sandbox.visitor);
    const inHousehold = ['household_id = $1', [householdId]] as const;

    const [household] = await view('households', ...inHousehold);
    expect(household?.origin).toBe('seeded');
    expect(household?.name).toEqual(expect.stringMatching(/./));
    const people = await view(
      'users',
      'user_id in (select user_id from analytics.members where household_id = $1)',
      [householdId],
    );
    expect(people.map((p) => p.display_name).sort()).toEqual(['Jane Doe', 'John Doe']);

    // Seeded rows: shared ones with their text, private ones as stubs.
    const seeded = await view('transactions', ...inHousehold);
    expect(seeded.length).toBeGreaterThan(50);
    expect(seeded.every((t) => t.origin === 'seeded')).toBe(true);
    const imported = seeded.filter((t) => !t.redacted && t.import_batch_id);
    expect(imported.length).toBeGreaterThan(0);
    for (const t of imported) {
      const text = [t.description, t.counterparty, t.import_fingerprint];
      expect(text.every((value) => typeof value === 'string')).toBe(true);
    }
    const stubs = seeded.filter((t) => t.redacted);
    expect(stubs.length).toBeGreaterThan(0);
    for (const t of stubs) {
      expect(t).toMatchObject({
        visibility: 'private',
        amount: null,
        occurred_on: null,
        created_by: null,
        description: null,
        counterparty: null,
      });
    }
    const notes = (await view('settlements', ...inHousehold)).map((s) => s.note);
    expect(notes.some((note) => typeof note === 'string')).toBe(true);
    const categories = await view('categories', ...inHousehold);
    expect(categories.every((c) => typeof c.name === 'string')).toBe(true);

    // The visitor edits a seeded transaction, renames the household and a category, adds
    // a transaction and a payment, and makes a household of their own.
    const story = imported[0];
    if (!story) throw new Error('No seeded transaction');
    await db
      .update(transactions)
      .set({ description: 'My own words' })
      .where(eq(transactions.id, story.transaction_id as string));
    const auth = await bearer(visitor);
    await request(app)
      .patch(`/api/households/${householdId}`)
      .set('Authorization', auth)
      .send({ name: 'The Smiths' })
      .expect(200);
    const category = categories[0];
    if (!category) throw new Error('No category');
    await request(app)
      .patch(`/api/households/${householdId}/categories/${category.category_id as string}`)
      .set('Authorization', auth)
      .send({ name: 'My category' })
      .expect(200);
    const added = await addTransaction(householdId, visitor, shared(visitor, [visitor]));
    const partnerId = people.find((p) => p.display_name === 'Jane Doe')?.user_id as string;
    const payment = await request(app)
      .post(`/api/households/${householdId}/settlements`)
      .set('Authorization', auth)
      .send({
        fromUserId: visitor.id,
        toUserId: partnerId,
        amount: 500,
        settledOn: TODAY,
        note: 'My bank, my name',
      })
      .expect(201);
    const paymentId = settlementResponseSchema.parse(payment.body).settlement.id;
    const ownHouseholdId = await createHousehold(app, visitor, 'My real home');

    expect(await transactionRow(story.transaction_id as string)).toMatchObject({
      origin: 'seeded',
      description: null,
      // Bank text is never edited, so it stays.
      counterparty: story.counterparty,
    });
    expect(await transactionRow(added.id)).toMatchObject({
      origin: 'visitor',
      redacted: false,
      amount: '10000',
      description: null,
    });
    expect((await view('households', ...inHousehold))[0]).toMatchObject({ name: null });
    const [renamed] = await view('categories', 'category_id = $1', [category.category_id]);
    expect(renamed).toMatchObject({ origin: 'seeded', name: null });
    const [note] = await view('settlements', 'settlement_id = $1', [paymentId]);
    expect(note).toMatchObject({ origin: 'visitor', note: null, amount: '500' });
    const [own] = await view('households', 'household_id = $1', [ownHouseholdId]);
    expect(own).toMatchObject({ origin: 'visitor', name: null });
    const ownCategories = await view('categories', 'household_id = $1', [ownHouseholdId]);
    expect(ownCategories.every((c) => c.name === null)).toBe(true);

    // What the visitor imports may be a real bank export: a stub, without its splits.
    const batch = await importShared(householdId, visitor, 'visitor-row-1');
    const [fromFile] = await importedBy(batch.id);
    expect(fromFile).toMatchObject({
      visibility: 'shared',
      redacted: true,
      origin: 'visitor',
      amount: null,
      counterparty: null,
      import_fingerprint: null,
    });
    expect(await splitsOf(fromFile?.transaction_id as string)).toEqual([]);
    const [visitorBatch] = await view('import_batches', 'import_batch_id = $1', [batch.id]);
    expect(visitorBatch).toMatchObject({ origin: 'visitor', row_count: 1 });
  });

  it('keeps nothing of a deleted sandbox', async () => {
    const sandbox = await createSandbox({ ttlDays: 7, maxActive: 200 }, { today: TODAY, seed: 8 });
    const counts = async () => {
      const { rows } = await pool.query<{ n: string }>(
        `select (select count(*) from analytics.households where household_id = $1)
              + (select count(*) from analytics.members where household_id = $1)
              + (select count(*) from analytics.transactions where household_id = $1)
              + (select count(*) from analytics.transaction_splits where household_id = $1)
              + (select count(*) from analytics.settlements where household_id = $1)
              + (select count(*) from analytics.demos where household_id = $1) as n`,
        [sandbox.householdId],
      );
      return Number(rows[0]?.n);
    };
    expect(await counts()).toBeGreaterThan(0);
    await deleteDemo(sandbox.demoId);
    // Gone from the views: the extract finds deleted sandboxes by their missing ids.
    expect(await counts()).toBe(0);
  });
});

describe('outside a sandbox (no demos row)', () => {
  it('shows no free text and no display names', async () => {
    const { anna, householdId } = await plainHousehold();
    const t = await addTransaction(householdId, anna, shared(anna, [anna]));
    expect(await transactionRow(t.id)).toMatchObject({
      origin: 'visitor',
      redacted: false,
      amount: '10000',
      description: null,
    });
    const [household] = await view('households', 'household_id = $1', [householdId]);
    expect(household).toMatchObject({ origin: 'visitor', name: null });
    const [user] = await view('users', 'user_id = $1', [anna.id]);
    expect(user).toMatchObject({ display_name: null });
  });

  it('turns a transaction made private into a stub, and back', async () => {
    const { anna, ben, householdId } = await plainHousehold();
    const body = shared(anna, [anna, ben]);
    const t = await addTransaction(householdId, anna, body);
    const before = await transactionRow(t.id);
    expect(before).toMatchObject({ visibility: 'shared', redacted: false, amount: '10000' });
    expect(await splitsOf(t.id)).toHaveLength(2);

    // The row stays (with a newer updated_at), so an incremental extract sees the change.
    const privateBody = {
      visibility: 'private',
      kind: body.kind,
      amount: body.amount,
      occurredOn: body.occurredOn,
      description: body.description,
      categoryId: body.categoryId,
    };
    const hidden = await updateTransaction(householdId, anna, t.id, privateBody, t.version);
    const stub = await transactionRow(t.id);
    expect(stub).toMatchObject({
      visibility: 'private',
      redacted: true,
      amount: null,
      kind: null,
      occurred_on: null,
      category_id: null,
      paid_by: null,
      created_by: null,
    });
    expect(changedAt(stub)).toBeGreaterThan(changedAt(before));
    expect(await splitsOf(t.id)).toEqual([]);

    await updateTransaction(householdId, anna, t.id, body, hidden.version);
    expect(await transactionRow(t.id)).toMatchObject({ redacted: false, amount: '10000' });
    expect(await splitsOf(t.id)).toHaveLength(2);
  });

  it('makes an imported transaction a stub', async () => {
    const { anna, householdId } = await plainHousehold();
    const batch = await importShared(householdId, anna, 'row-1');
    expect(await importedBy(batch.id)).toEqual([
      expect.objectContaining({ redacted: true, amount: null }),
    ]);
  });
});

describe('the watermark (updated_at)', () => {
  it('moves on every change of a transaction', async () => {
    const { anna, ben, householdId } = await plainHousehold();
    const auth = await bearer(anna);
    const base = `/api/households/${householdId}`;
    const body = shared(anna, [anna, ben], { description: 'Tesco' });
    const t = await addTransaction(householdId, anna, body);
    let last = changedAt(await transactionRow(t.id));
    const moved = async () => {
      const row = await transactionRow(t.id);
      expect(changedAt(row)).toBeGreaterThan(last);
      last = changedAt(row);
      return row;
    };

    const edited = await updateTransaction(householdId, anna, t.id, { ...body, amount: 9000 }, 1);
    await moved();

    // A rule categorizing earlier transactions.
    const categories = categoryListResponseSchema.parse(
      (await request(app).get(`${base}/categories`).set('Authorization', auth).expect(200)).body,
    ).categories;
    const groceries = categories.find((c) => c.kind === 'expense');
    if (!groceries) throw new Error('No expense category');
    const created = await request(app)
      .post(`${base}/rules`)
      .set('Authorization', auth)
      .send({ pattern: 'tesco', categoryId: groceries.id, markShared: false })
      .expect(201);
    const rule = ruleResponseSchema.parse(created.body).rule;
    const applied = await request(app)
      .post(`${base}/rules/${rule.id}/apply`)
      .set('Authorization', auth)
      .expect(200);
    expect(ruleApplyResponseSchema.parse(applied.body).updated).toBe(1);
    expect(await moved()).toMatchObject({ category_id: groceries.id, version: edited.version + 1 });

    await request(app)
      .delete(`${base}/transactions/${t.id}`)
      .set('Authorization', auth)
      .expect(204);
    expect((await moved()).deleted_at).toBeInstanceOf(Date);
    await request(app)
      .post(`${base}/transactions/${t.id}/restore`)
      .set('Authorization', auth)
      .expect(200);
    expect(await moved()).toMatchObject({ deleted_at: null });
  });

  it('moves when an import is undone and when a payment is deleted or restored', async () => {
    const { anna, ben, householdId } = await plainHousehold();
    const auth = await bearer(anna);
    const base = `/api/households/${householdId}`;

    const batch = await importShared(householdId, anna, 'row-1');
    const [imported] = await importedBy(batch.id);
    if (!imported) throw new Error('No imported transaction');
    await request(app).delete(`${base}/imports/${batch.id}`).set('Authorization', auth).expect(204);
    const undone = await transactionRow(imported.transaction_id as string);
    expect(changedAt(undone)).toBeGreaterThan(changedAt(imported));
    const [undoneBatch] = await view('import_batches', 'import_batch_id = $1', [batch.id]);
    expect(undoneBatch?.undone_at).toBeInstanceOf(Date);
    expect(undoneBatch?.changed_at).toEqual(undoneBatch?.undone_at);

    const paid = await request(app)
      .post(`${base}/settlements`)
      .set('Authorization', auth)
      .send({ fromUserId: anna.id, toUserId: ben.id, amount: 500, settledOn: TODAY, note: null })
      .expect(201);
    const id = settlementResponseSchema.parse(paid.body).settlement.id;
    const payment = async () => (await view('settlements', 'settlement_id = $1', [id]))[0] ?? {};
    const first = await payment();
    await request(app).delete(`${base}/settlements/${id}`).set('Authorization', auth).expect(204);
    const deleted = await payment();
    expect(changedAt(deleted)).toBeGreaterThan(changedAt(first));
    await request(app)
      .post(`${base}/settlements/${id}/restore`)
      .set('Authorization', auth)
      .expect(200);
    expect(changedAt(await payment())).toBeGreaterThan(changedAt(deleted));
  });

  it('moves when a household is renamed or archived', async () => {
    const anna = await createTestUser('Anna');
    const householdId = await createHousehold(app, anna);
    const auth = await bearer(anna);
    const household = async () =>
      (await view('households', 'household_id = $1', [householdId]))[0] ?? {};
    const first = await household();
    const renamed = await request(app)
      .patch(`/api/households/${householdId}`)
      .set('Authorization', auth)
      .send({ name: 'Új név' })
      .expect(200);
    householdResponseSchema.parse(renamed.body);
    const second = await household();
    expect(changedAt(second)).toBeGreaterThan(changedAt(first));
    await request(app)
      .delete(`/api/households/${householdId}`)
      .set('Authorization', auth)
      .expect(204);
    const archived = await household();
    expect(changedAt(archived)).toBeGreaterThan(changedAt(second));
    expect(archived.archived_at).toBeInstanceOf(Date);
  });
});
