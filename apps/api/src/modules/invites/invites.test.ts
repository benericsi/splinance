import {
  apiErrorResponseSchema,
  createInviteResponseSchema,
  householdListResponseSchema,
  householdResponseSchema,
  INVITE_TTL_DAYS,
  inviteListResponseSchema,
  invitePreviewResponseSchema,
} from '@splinance/shared';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { bearer, createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { householdInvites, householdMembers } from '../../db/schema';
import { hashToken } from '../../lib/random-token';

type App = ReturnType<typeof createApp>;

const DAY_MS = 24 * 60 * 60 * 1000;

function errorCode(res: request.Response): string {
  return apiErrorResponseSchema.parse(res.body).error.code;
}

async function createHousehold(owner: TestUser, name = 'Otthon'): Promise<string> {
  const res = await request(app)
    .post('/api/households')
    .set('Authorization', await bearer(owner))
    .send({ name })
    .expect(201);
  return householdResponseSchema.parse(res.body).household.id;
}

async function createInvite(owner: TestUser, householdId: string) {
  const res = await request(app)
    .post(`/api/households/${householdId}/invites`)
    .set('Authorization', await bearer(owner))
    .expect(201);
  return createInviteResponseSchema.parse(res.body);
}

async function accept(user: TestUser, token: string) {
  return request(app)
    .post(`/api/invites/${token}/accept`)
    .set('Authorization', await bearer(user));
}

function preview(token: string) {
  return request(app).get(`/api/invites/${token}`);
}

let app: App;
let anna: TestUser;
let bela: TestUser;
let cili: TestUser;
let householdId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  bela = await createTestUser('Bela');
  cili = await createTestUser('Cili');
  householdId = await createHousehold(anna);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('creating invites', () => {
  it('returns the token once and stores only its hash, valid for 7 days', async () => {
    const before = Date.now();
    const { token, invite } = await createInvite(anna, householdId);

    expect(invite.invitedBy).toEqual({ userId: anna.id, displayName: 'Anna' });
    const ttl = new Date(invite.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(INVITE_TTL_DAYS * DAY_MS);
    expect(ttl).toBeLessThan(INVITE_TTL_DAYS * DAY_MS + 60_000);

    const [row] = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, invite.id));
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('lists only pending invites to owners', async () => {
    const used = await createInvite(anna, householdId);
    const revoked = await createInvite(anna, householdId);
    const pending = await createInvite(anna, householdId);
    await accept(bela, used.token);
    await request(app)
      .delete(`/api/households/${householdId}/invites/${revoked.invite.id}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    const res = await request(app)
      .get(`/api/households/${householdId}/invites`)
      .set('Authorization', await bearer(anna))
      .expect(200);
    const { invites } = inviteListResponseSchema.parse(res.body);
    expect(invites.map((i) => i.id)).toEqual([pending.invite.id]);
  });
});

describe('GET /api/invites/:token (preview)', () => {
  it('is public and shows only the household name, inviter and expiry', async () => {
    const { token } = await createInvite(anna, householdId);

    const res = await preview(token).expect(200);
    const { invite } = invitePreviewResponseSchema.parse(res.body);
    expect(invite).toMatchObject({ householdName: 'Otthon', invitedBy: { displayName: 'Anna' } });
    expect(JSON.stringify(res.body)).not.toContain(householdId);
    expect(JSON.stringify(res.body)).not.toContain(anna.id);
  });

  it('answers 404 for unknown and malformed tokens', async () => {
    expect(errorCode(await preview('a'.repeat(43)).expect(404))).toBe('INVITE_NOT_FOUND');
    expect(errorCode(await preview('short').expect(404))).toBe('INVITE_NOT_FOUND');
  });
});

describe('POST /api/invites/:token/accept', () => {
  it('joins the household as a member and uses up the invite', async () => {
    const { token, invite } = await createInvite(anna, householdId);

    const res = await accept(bela, token);
    expect(res.status).toBe(200);
    expect(householdResponseSchema.parse(res.body).household).toMatchObject({
      id: householdId,
      role: 'member',
    });

    const list = await request(app)
      .get('/api/households')
      .set('Authorization', await bearer(bela))
      .expect(200);
    expect(householdListResponseSchema.parse(list.body).households).toHaveLength(1);

    const [row] = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, invite.id));
    expect(row).toMatchObject({ acceptedBy: bela.id });
    expect(row?.acceptedAt).toBeInstanceOf(Date);
  });

  it('requires authentication', async () => {
    const { token } = await createInvite(anna, householdId);
    const res = await request(app).post(`/api/invites/${token}/accept`).expect(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('is single use', async () => {
    const { token } = await createInvite(anna, householdId);
    expect((await accept(bela, token)).status).toBe(200);

    const reused = await accept(cili, token);
    expect(reused.status).toBe(410);
    expect(errorCode(reused)).toBe('INVITE_USED');
    expect(errorCode(await preview(token).expect(410))).toBe('INVITE_USED');
  });

  it('lets exactly one of two parallel accepts win', async () => {
    const { token } = await createInvite(anna, householdId);

    const results = await Promise.all([accept(bela, token), accept(cili, token)]);

    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 410]);
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, householdId));
    expect(members).toHaveLength(2);
  });

  it('rejects expired invites', async () => {
    const { token } = await createInvite(anna, householdId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + INVITE_TTL_DAYS * DAY_MS + 1000);

    expect(errorCode(await preview(token).expect(410))).toBe('INVITE_EXPIRED');
    const res = await accept(bela, token);
    expect(res.status).toBe(410);
    expect(errorCode(res)).toBe('INVITE_EXPIRED');
  });

  it('rejects revoked invites', async () => {
    const { token, invite } = await createInvite(anna, householdId);
    await request(app)
      .delete(`/api/households/${householdId}/invites/${invite.id}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    expect(errorCode(await preview(token).expect(410))).toBe('INVITE_REVOKED');
    expect(errorCode(await accept(bela, token))).toBe('INVITE_REVOKED');

    const again = await request(app)
      .delete(`/api/households/${householdId}/invites/${invite.id}`)
      .set('Authorization', await bearer(anna))
      .expect(404);
    expect(errorCode(again)).toBe('INVITE_NOT_FOUND');
  });

  it('refuses existing members without using up the invite', async () => {
    const { token } = await createInvite(anna, householdId);

    const res = await accept(anna, token);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ALREADY_MEMBER');

    expect((await accept(bela, token)).status).toBe(200);
  });

  it('lets a former member rejoin as a member with a fresh join date', async () => {
    const first = await createInvite(anna, householdId);
    await accept(bela, first.token);
    await request(app)
      .post(`/api/households/${householdId}/leave`)
      .set('Authorization', await bearer(bela))
      .expect(204);
    const [before] = await db
      .select()
      .from(householdMembers)
      .where(
        and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, bela.id)),
      );

    const second = await createInvite(anna, householdId);
    expect((await accept(bela, second.token)).status).toBe(200);

    const [after] = await db
      .select()
      .from(householdMembers)
      .where(
        and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, bela.id)),
      );
    expect(after).toMatchObject({ role: 'member', leftAt: null });
    expect(after?.joinedAt.getTime()).toBeGreaterThanOrEqual(before?.leftAt?.getTime() ?? Infinity);
  });

  it('treats invites of archived households as not found', async () => {
    const { token } = await createInvite(anna, householdId);
    await request(app)
      .delete(`/api/households/${householdId}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    expect(errorCode(await preview(token).expect(404))).toBe('INVITE_NOT_FOUND');
    const res = await accept(bela, token);
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe('INVITE_NOT_FOUND');
  });

  it('cannot be used by an owner who was removed', async () => {
    const id = await createHousehold(bela, 'Trip');
    const join = await createInvite(bela, id);
    await accept(cili, join.token);
    await request(app)
      .patch(`/api/households/${id}/members/${cili.id}`)
      .set('Authorization', await bearer(bela))
      .send({ role: 'owner' })
      .expect(200);
    const backdoor = await createInvite(cili, id);

    await request(app)
      .delete(`/api/households/${id}/members/${cili.id}`)
      .set('Authorization', await bearer(bela))
      .expect(204);

    const res = await accept(cili, backdoor.token);
    expect(res.status).toBe(410);
    expect(errorCode(res)).toBe('INVITE_REVOKED');
  });
});
