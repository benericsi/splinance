import {
  balancesResponseSchema,
  budgetListResponseSchema,
  buildDemoStory,
  demoBalance,
  demoCreateResponseSchema,
  demoStatusResponseSchema,
  householdDetailResponseSchema,
  meResponseSchema,
  renderDemoBankFiles,
} from '@splinance/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode } from '../../../test/households';
import { bearer, createTestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db, pool } from '../../db/client';
import { demos, importBatches, settlements, transactions } from '../../db/schema';
import { REFRESH_COOKIE } from '../auth/auth.routes';
import { CLEANUP_LOCK, deleteExpiredDemos } from './demo.cleanup';
import { createDemo, createSandbox, type DemoConfig, deleteDemo } from './demo.service';
import type * as SeedModule from './demo.seed';

// Lets a test make seeding fail after it has written everything.
const seeding = vi.hoisted(() => ({ fail: false }));
vi.mock('./demo.seed', async (importOriginal) => {
  const actual = await importOriginal<typeof SeedModule>();
  return {
    ...actual,
    seedDemo: async (...args: Parameters<typeof actual.seedDemo>) => {
      const householdId = await actual.seedDemo(...args);
      if (seeding.fail) throw new Error('Seeding failed on purpose');
      return householdId;
    },
  };
});

const config: DemoConfig = { ttlDays: 7, maxActive: 200 };
const TODAY = '2026-10-28';

let app: App;

beforeEach(async () => {
  await resetDatabase();
  seeding.fail = false;
  app = createApp({ demo: config });
});

/** Rows in every table of the public schema, by table. */
async function rowCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  const counts: Record<string, number> = {};
  for (const { tablename } of rows) {
    const result = await pool.query<{ n: string }>(`select count(*) as n from "${tablename}"`);
    counts[tablename] = Number(result.rows[0]?.n);
  }
  return counts;
}

describe('without demo mode (production)', () => {
  it('has no demo routes and keeps registration and joining open', async () => {
    const production = createApp({ demo: null });
    await request(production).post('/api/demo').expect(404);
    await request(production)
      .post('/api/auth/register')
      .send({ email: 'anna@example.com', password: 'correct horse battery', displayName: 'Anna' })
      .expect(201);
  });
});

describe('POST /api/demo', { timeout: 30_000 }, () => {
  it('signs in a new visitor with a seeded household', async () => {
    const res = await request(app).post('/api/demo').expect(201);
    const body = demoCreateResponseSchema.parse(res.body);
    expect(body.user.displayName).toBe('John Doe');
    expect(body.user.email).toMatch(/^demo-[0-9a-f-]{36}@demo\.invalid$/);
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_COOKIE}=`);
    const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);

    const auth = `Bearer ${body.accessToken}`;
    const me = await request(app).get('/api/me').set('Authorization', auth).expect(200);
    expect(meResponseSchema.parse(me.body).user.id).toBe(body.user.id);

    const detail = await request(app)
      .get(`/api/households/${body.householdId}`)
      .set('Authorization', auth)
      .expect(200);
    const { household } = householdDetailResponseSchema.parse(detail.body);
    expect(household.name).toBe('Doe household');
    expect(household.members.map((m) => [m.displayName, m.role])).toEqual(
      expect.arrayContaining([
        ['John Doe', 'owner'],
        ['Jane Doe', 'member'],
      ]),
    );

    const status = await request(app).get('/api/demo').set('Authorization', auth).expect(200);
    expect(demoStatusResponseSchema.parse(status.body).demo.expiresAt).toBe(body.expiresAt);
  });

  it('turns the whole story into the household', async () => {
    const story = buildDemoStory({ seed: 1, today: TODAY });
    const demo = await createDemo(config, { seed: 1, today: TODAY });
    const auth = `Bearer ${demo.accessToken}`;
    const live = and(
      eq(transactions.householdId, demo.householdId),
      isNull(transactions.deletedAt),
    );

    const [txCount] = await db.select({ n: count() }).from(transactions).where(live);
    expect(txCount?.n).toBe(story.transactions.length);
    const [settlementCount] = await db
      .select({ n: count() })
      .from(settlements)
      .where(eq(settlements.householdId, demo.householdId));
    expect(settlementCount?.n).toBe(story.settlements.length);
    // One import per monthly export, both people.
    const [batchCount] = await db
      .select({ n: count() })
      .from(importBatches)
      .where(eq(importBatches.householdId, demo.householdId));
    expect(batchCount?.n).toBe(renderDemoBankFiles(story).length);

    // The app's balance is the story's, up to a leftover forint per odd equal split.
    const res = await request(app)
      .get(`/api/households/${demo.householdId}/balances`)
      .set('Authorization', auth)
      .expect(200);
    const [debt] = balancesResponseSchema.parse(res.body).balances.debts;
    const expected = demoBalance(story);
    const slack = story.transactions.filter(
      (t) =>
        t.share.visibility === 'shared' && t.share.split.method === 'equal' && t.amount % 2 === 1,
    ).length;
    expect(debt?.from.displayName).toBe(expected > 0 ? 'John Doe' : 'Jane Doe');
    expect(Math.abs((debt?.amount ?? 0) - Math.abs(expected))).toBeLessThanOrEqual(slack);

    // The overview's budget alert has something to show.
    const budgetRes = await request(app)
      .get(`/api/households/${demo.householdId}/budgets?month=2026-10`)
      .set('Authorization', auth)
      .expect(200);
    const list = budgetListResponseSchema.parse(budgetRes.body).budgets.budgets;
    expect(list.some((b) => b.spent / b.amount >= 0.8)).toBe(true);
  });

  it('gives demo accounts no usable password', async () => {
    const demo = await createDemo(config, { seed: 2, today: TODAY });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: demo.user.email, password: 'correct horse battery' })
      .expect(401);
    expect(errorCode(res)).toBe('INVALID_CREDENTIALS');
  });

  it('stops at the cap of active demos; expired ones do not count', async () => {
    await createDemo(config, { seed: 3, today: TODAY });
    const full = createApp({ demo: { ttlDays: 7, maxActive: 1 } });
    const res = await request(full).post('/api/demo').expect(503);
    expect(errorCode(res)).toBe('DEMO_CAPACITY');

    await db.update(demos).set({ expiresAt: new Date(Date.now() - 1000) });
    await request(full).post('/api/demo').expect(201);
  });

  it('deletes everything it made when seeding fails', async () => {
    seeding.fail = true;
    const res = await request(app).post('/api/demo').expect(500);
    expect(errorCode(res)).toBe('INTERNAL_ERROR');
    const counts = await rowCounts();
    expect(Object.entries(counts).filter(([, n]) => n > 0)).toEqual([]);
  });
});

describe('deleteDemo', { timeout: 30_000 }, () => {
  it('removes the sandbox and every row in it, including households the visitor made', async () => {
    const demo = await createDemo(config, { seed: 4, today: TODAY });
    await createHousehold(app, { id: demo.user.id, displayName: 'John Doe' }, 'Second home');
    // Someone else's data stays.
    const other = await createTestUser('Anna');
    await createHousehold(app, other, 'Anna home');
    const [row] = await db.select().from(demos);
    expect(await deleteDemo(row?.id ?? '')).toBe(true);
    expect(await deleteDemo(row?.id ?? '')).toBe(false);

    const after = await rowCounts();
    expect(after.users).toBe(1);
    expect(after.households).toBe(1);
    expect(after.household_members).toBe(1);
    expect(after.categories).toBe(12);
    for (const table of [
      'demos',
      'sessions',
      'transactions',
      'transaction_splits',
      'settlements',
      'audit_log',
      'import_batches',
      'category_rules',
      'budgets',
      'household_invites',
    ]) {
      expect(after[table], table).toBe(0);
    }
  });
});

describe('demo mode guards', () => {
  it('closes registration and joining by invite', async () => {
    const register = await request(app)
      .post('/api/auth/register')
      .send({ email: 'anna@example.com', password: 'correct horse battery', displayName: 'Anna' })
      .expect(403);
    expect(errorCode(register)).toBe('DEMO_MODE');

    const anna = await createTestUser('Anna');
    const accept = await request(app)
      .post(`/api/invites/${'a'.repeat(43)}/accept`)
      .set('Authorization', await bearer(anna))
      .expect(403);
    expect(errorCode(accept)).toBe('DEMO_MODE');
  });

  it('answers 404 for the status of a non-demo account', async () => {
    const anna = await createTestUser('Anna');
    const res = await request(app)
      .get('/api/demo')
      .set('Authorization', await bearer(anna))
      .expect(404);
    expect(errorCode(res)).toBe('DEMO_NOT_FOUND');
    await request(app).get('/api/demo').expect(401);
  });
});

describe('DELETE /api/demo', { timeout: 30_000 }, () => {
  it("deletes the caller's sandbox and ends the session", async () => {
    const created = await request(app).post('/api/demo').expect(201);
    const { accessToken } = demoCreateResponseSchema.parse(created.body);
    const cookie = String(created.headers['set-cookie']).split(';')[0] ?? '';

    const res = await request(app)
      .delete('/api/demo')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(new RegExp(`^${REFRESH_COOKIE}=;`));

    const counts = await rowCounts();
    expect(Object.entries(counts).filter(([, n]) => n > 0)).toEqual([]);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    const status = await request(app)
      .get('/api/demo')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(errorCode(status)).toBe('DEMO_NOT_FOUND');
  });

  it('answers 404 for an account that is not a demo, 401 without one', async () => {
    const anna = await createTestUser('Anna');
    const res = await request(app)
      .delete('/api/demo')
      .set('Authorization', await bearer(anna))
      .expect(404);
    expect(errorCode(res)).toBe('DEMO_NOT_FOUND');
    await request(app).delete('/api/demo').expect(401);
  });
});

describe('deleteExpiredDemos', { timeout: 30_000 }, () => {
  it('deletes the sandboxes whose time is up and keeps the rest', async () => {
    const expiring = await createSandbox(config, { seed: 5, today: TODAY });
    const staying = await createSandbox(config, { seed: 6, today: TODAY });
    // No one signs in to a sandbox made this way.
    expect((await rowCounts()).sessions).toBe(0);
    await db
      .update(demos)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(demos.id, expiring.demoId));

    expect(await deleteExpiredDemos()).toBe(1);
    expect(await deleteExpiredDemos()).toBe(0);
    expect((await db.select({ id: demos.id }).from(demos)).map((d) => d.id)).toEqual([
      staying.demoId,
    ]);
  });

  it('skips the run while another instance holds the cleanup lock', async () => {
    const sandbox = await createSandbox(config, { seed: 7, today: TODAY });
    await db.update(demos).set({ expiresAt: new Date(Date.now() - 1000) });

    const other = await pool.connect();
    try {
      await other.query('select pg_advisory_lock(hashtext($1))', [CLEANUP_LOCK]);
      expect(await deleteExpiredDemos()).toBe(0);
      await other.query('select pg_advisory_unlock(hashtext($1))', [CLEANUP_LOCK]);
    } finally {
      other.release();
    }
    expect(await deleteExpiredDemos()).toBe(1);
    expect(await db.select().from(demos).where(eq(demos.id, sandbox.demoId))).toEqual([]);
  });
});
