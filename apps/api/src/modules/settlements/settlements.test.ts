import {
  type Settlement,
  settlementListResponseSchema,
  settlementResponseSchema,
} from '@splinance/shared';
import { and, asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { type App, createHousehold, errorCode, join } from '../../../test/households';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { auditLog, settlements } from '../../db/schema';

let app: App;
let anna: TestUser;
let ben: TestUser;
let cara: TestUser;
let householdId: string;

const base = (suffix = '') => `/api/households/${householdId}/settlements${suffix}`;

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

function input(from: TestUser, to: TestUser, overrides: Record<string, unknown> = {}) {
  return {
    fromUserId: from.id,
    toUserId: to.id,
    amount: 10_000,
    settledOn: '2026-10-12',
    note: null,
    ...overrides,
  };
}

async function post(user: TestUser, body: object) {
  return request(app)
    .post(base())
    .set('Authorization', await bearer(user))
    .send(body);
}

async function create(user: TestUser, body: object): Promise<Settlement> {
  const res = await post(user, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return settlementResponseSchema.parse(res.body).settlement;
}

async function list(user: TestUser, query: Record<string, string> = {}) {
  const res = await request(app)
    .get(base())
    .query(query)
    .set('Authorization', await bearer(user))
    .expect(200);
  return settlementListResponseSchema.parse(res.body);
}

describe('POST /api/households/:id/settlements', () => {
  it('records a payment with names, the household currency and a trimmed note', async () => {
    const settlement = await create(ben, input(ben, anna, { note: '  cash  ' }));
    expect(settlement).toMatchObject({
      from: { userId: ben.id, displayName: 'Ben' },
      to: { userId: anna.id, displayName: 'Anna' },
      amount: 10_000,
      currency: 'HUF',
      settledOn: '2026-10-12',
      note: 'cash',
      createdBy: { userId: ben.id, displayName: 'Ben' },
    });

    const empty = await create(ben, input(ben, anna, { note: '   ' }));
    expect(empty.note).toBeNull();
  });

  it('validates the input', async () => {
    const self = await post(ben, input(ben, ben));
    expect(self.status).toBe(400);
    expect(errorCode(self)).toBe('VALIDATION_ERROR');
    expect((await post(ben, input(ben, anna, { amount: 0 }))).status).toBe(400);
    expect((await post(ben, input(ben, anna, { settledOn: '2026-13-01' }))).status).toBe(400);

    const stranger = await createTestUser('Eve');
    const notMember = await post(anna, input(stranger, anna));
    expect(notMember.status).toBe(400);
    expect(errorCode(notMember)).toBe('INVALID_MEMBER');
  });

  it('lets members record only their own payments; owners record any pair', async () => {
    const forOthers = await post(cara, input(ben, anna));
    expect(forOthers.status).toBe(403);
    expect(errorCode(forOthers)).toBe('FORBIDDEN');

    await create(cara, input(cara, ben));
    await create(cara, input(ben, cara));
    await create(anna, input(ben, cara));
  });

  it('is 404 for outsiders and 401 without a token', async () => {
    const outsider = await createTestUser('Eve');
    const res = await post(outsider, input(ben, anna));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
    await request(app).post(base()).send(input(ben, anna)).expect(401);
  });
});

describe('GET /api/households/:id/settlements', () => {
  it('pages newest first with a stable cursor, ties broken by id', async () => {
    const created: Settlement[] = [];
    for (const settledOn of ['2026-10-01', '2026-10-03', '2026-10-03', '2026-10-02']) {
      created.push(await create(ben, input(ben, anna, { settledOn })));
    }
    const [oct1, oct3a, oct3b, oct2] = created.map((s) => s.id);

    const first = await list(cara, { limit: '2' });
    expect(first.settlements.map((s) => s.id)).toEqual([oct3b, oct3a]);
    expect(first.nextCursor).not.toBeNull();

    const second = await list(cara, { limit: '2', cursor: first.nextCursor ?? '' });
    expect(second.settlements.map((s) => s.id)).toEqual([oct2, oct1]);
    expect(second.nextCursor).toBeNull();

    const bad = await request(app)
      .get(base())
      .query({ cursor: 'nonsense' })
      .set('Authorization', await bearer(anna));
    expect(bad.status).toBe(400);
  });
});

describe('deleting and restoring', () => {
  it('soft deletes, restores (idempotently) and audits both', async () => {
    const settlement = await create(ben, input(ben, anna));

    await request(app)
      .delete(base(`/${settlement.id}`))
      .set('Authorization', await bearer(ben))
      .expect(204);
    expect((await list(anna)).settlements).toEqual([]);
    // Deleted is gone: a second delete is a 404.
    await request(app)
      .delete(base(`/${settlement.id}`))
      .set('Authorization', await bearer(ben))
      .expect(404);

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post(base(`/${settlement.id}/restore`))
        .set('Authorization', await bearer(ben))
        .expect(200);
      expect(settlementResponseSchema.parse(res.body).settlement.id).toBe(settlement.id);
    }
    expect((await list(anna)).settlements.map((s) => s.id)).toEqual([settlement.id]);

    const entries = await db
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'settlement'), eq(auditLog.entityId, settlement.id)))
      .orderBy(asc(auditLog.createdAt), asc(auditLog.id));
    expect(entries).toEqual([
      { action: 'create', actorId: ben.id },
      { action: 'delete', actorId: ben.id },
      { action: 'restore', actorId: ben.id },
    ]);
  });

  it('lets the two people, the recorder and owners remove a payment, nobody else', async () => {
    const settlement = await create(ben, input(ben, anna));
    const asCara = await request(app)
      .delete(base(`/${settlement.id}`))
      .set('Authorization', await bearer(cara));
    expect(asCara.status).toBe(403);

    // Anna is both the receiver and an owner; recorded by the owner for a pair she is not in.
    const byOwner = await create(anna, input(ben, cara));
    await request(app)
      .delete(base(`/${byOwner.id}`))
      .set('Authorization', await bearer(cara))
      .expect(204);
    await request(app)
      .post(base(`/${byOwner.id}/restore`))
      .set('Authorization', await bearer(anna))
      .expect(200);
  });

  it('answers 404 for unknown, malformed and other households’ ids', async () => {
    const settlement = await create(ben, input(ben, anna));
    const otherHousehold = await createHousehold(app, cara, 'Other');

    await request(app)
      .delete(base('/not-a-uuid'))
      .set('Authorization', await bearer(anna))
      .expect(404);
    const res = await request(app)
      .delete(`/api/households/${otherHousehold}/settlements/${settlement.id}`)
      .set('Authorization', await bearer(cara));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('SETTLEMENT_NOT_FOUND');
  });
});

describe('database-level protection', () => {
  it('rejects paying yourself (CHECK)', async () => {
    const error = await pgErrorOf(
      db.insert(settlements).values({
        householdId,
        fromUserId: ben.id,
        toUserId: ben.id,
        amount: 100,
        currency: 'HUF',
        settledOn: '2026-10-12',
        createdBy: ben.id,
      }),
    );
    expect(error).toMatchObject({ code: '23514', constraint: 'settlements_different_people' });
  });

  it('rejects people who never belonged to the household (composite FK)', async () => {
    const stranger = await createTestUser('Eve');
    await createHousehold(app, stranger, 'Elsewhere');
    const error = await pgErrorOf(
      db.insert(settlements).values({
        householdId,
        fromUserId: stranger.id,
        toUserId: anna.id,
        amount: 100,
        currency: 'HUF',
        settledOn: '2026-10-12',
        createdBy: anna.id,
      }),
    );
    expect(error).toMatchObject({ code: '23503', constraint: 'settlements_from_member_fk' });
  });
});
