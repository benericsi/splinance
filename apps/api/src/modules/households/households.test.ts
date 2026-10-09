import {
  apiErrorResponseSchema,
  createInviteResponseSchema,
  householdDetailResponseSchema,
  householdListResponseSchema,
  householdResponseSchema,
  memberResponseSchema,
} from '@splinance/shared';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { bearer, createTestUser, pgErrorOf, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { householdInvites, householdMembers, households } from '../../db/schema';

type App = ReturnType<typeof createApp>;

function errorCode(res: request.Response): string {
  return apiErrorResponseSchema.parse(res.body).error.code;
}

async function createHousehold(app: App, user: TestUser, name = 'Otthon'): Promise<string> {
  const res = await request(app)
    .post('/api/households')
    .set('Authorization', await bearer(user))
    .send({ name })
    .expect(201);
  return householdResponseSchema.parse(res.body).household.id;
}

async function createInvite(app: App, owner: TestUser, householdId: string) {
  const res = await request(app)
    .post(`/api/households/${householdId}/invites`)
    .set('Authorization', await bearer(owner))
    .expect(201);
  return createInviteResponseSchema.parse(res.body);
}

/** Joins through the real invite flow. */
async function join(app: App, owner: TestUser, householdId: string, user: TestUser) {
  const { token } = await createInvite(app, owner, householdId);
  await request(app)
    .post(`/api/invites/${token}/accept`)
    .set('Authorization', await bearer(user))
    .expect(200);
}

async function setRole(
  app: App,
  owner: TestUser,
  householdId: string,
  target: TestUser,
  role: string,
) {
  return request(app)
    .patch(`/api/households/${householdId}/members/${target.id}`)
    .set('Authorization', await bearer(owner))
    .send({ role });
}

async function activeOwnerCount(householdId: string): Promise<number> {
  const rows = await db
    .select()
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.role, 'owner')));
  return rows.filter((r) => r.leftAt === null).length;
}

let app: App;
let anna: TestUser;
let bela: TestUser;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  anna = await createTestUser('Anna');
  bela = await createTestUser('Bela');
});

describe('POST /api/households', () => {
  it('creates a HUF household with the creator as owner', async () => {
    const res = await request(app)
      .post('/api/households')
      .set('Authorization', await bearer(anna))
      .send({ name: '  Otthon  ' })
      .expect(201);

    const { household } = householdResponseSchema.parse(res.body);
    expect(household).toMatchObject({ name: 'Otthon', baseCurrency: 'HUF', role: 'owner' });

    const [member] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, household.id));
    expect(member).toMatchObject({ userId: anna.id, role: 'owner', leftAt: null });
  });

  it('validates the name', async () => {
    const res = await request(app)
      .post('/api/households')
      .set('Authorization', await bearer(anna))
      .send({ name: ' ' })
      .expect(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/households').send({ name: 'Otthon' }).expect(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });
});

describe('GET /api/households', () => {
  it('lists active memberships with the caller role, not left or archived ones', async () => {
    const home = await createHousehold(app, anna, 'Otthon');
    const trip = await createHousehold(app, bela, 'Trip');
    const left = await createHousehold(app, bela, 'Left');
    const archived = await createHousehold(app, anna, 'Archived');
    await join(app, bela, trip, anna);
    await join(app, bela, left, anna);
    await request(app)
      .post(`/api/households/${left}/leave`)
      .set('Authorization', await bearer(anna))
      .expect(204);
    await request(app)
      .delete(`/api/households/${archived}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    const res = await request(app)
      .get('/api/households')
      .set('Authorization', await bearer(anna))
      .expect(200);
    const { households: list } = householdListResponseSchema.parse(res.body);
    expect(list.map((h) => [h.id, h.role])).toEqual([
      [home, 'owner'],
      [trip, 'member'],
    ]);
  });
});

describe('GET /api/households/:id', () => {
  it('returns the active members with display names and no emails', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);

    const res = await request(app)
      .get(`/api/households/${id}`)
      .set('Authorization', await bearer(bela))
      .expect(200);
    const { household } = householdDetailResponseSchema.parse(res.body);
    expect(household.role).toBe('member');
    expect(household.members.map((m) => [m.displayName, m.role])).toEqual([
      ['Anna', 'owner'],
      ['Bela', 'member'],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  it('answers 404 for unknown and malformed ids', async () => {
    const unknown = await request(app)
      .get('/api/households/0199c3b2-7a4e-7cde-8f00-000000000001')
      .set('Authorization', await bearer(anna))
      .expect(404);
    expect(errorCode(unknown)).toBe('HOUSEHOLD_NOT_FOUND');

    const malformed = await request(app)
      .get('/api/households/not-a-uuid')
      .set('Authorization', await bearer(anna))
      .expect(404);
    expect(errorCode(malformed)).toBe('HOUSEHOLD_NOT_FOUND');
  });
});

describe('permission matrix', () => {
  interface Context {
    householdId: string;
    memberId: string;
    inviteId: string;
  }

  type Actor = 'owner' | 'member' | 'former member' | 'outsider' | 'anonymous';

  interface Route {
    name: string;
    method: 'get' | 'post' | 'patch' | 'delete';
    path: (ctx: Context) => string;
    body?: object;
    owner: number;
    member: number;
  }

  // The owner is the only owner; the target of member routes is the member.
  const routes: Route[] = [
    {
      name: 'get household',
      method: 'get',
      path: (c) => `/api/households/${c.householdId}`,
      owner: 200,
      member: 200,
    },
    {
      name: 'rename',
      method: 'patch',
      path: (c) => `/api/households/${c.householdId}`,
      body: { name: 'New name' },
      owner: 200,
      member: 403,
    },
    {
      name: 'archive',
      method: 'delete',
      path: (c) => `/api/households/${c.householdId}`,
      owner: 204,
      member: 403,
    },
    {
      name: 'leave',
      method: 'post',
      path: (c) => `/api/households/${c.householdId}/leave`,
      owner: 409,
      member: 204,
    },
    {
      name: 'change role',
      method: 'patch',
      path: (c) => `/api/households/${c.householdId}/members/${c.memberId}`,
      body: { role: 'owner' },
      owner: 200,
      member: 403,
    },
    {
      name: 'remove member',
      method: 'delete',
      path: (c) => `/api/households/${c.householdId}/members/${c.memberId}`,
      owner: 204,
      member: 403,
    },
    {
      name: 'create invite',
      method: 'post',
      path: (c) => `/api/households/${c.householdId}/invites`,
      owner: 201,
      member: 403,
    },
    {
      name: 'list invites',
      method: 'get',
      path: (c) => `/api/households/${c.householdId}/invites`,
      owner: 200,
      member: 403,
    },
    {
      name: 'revoke invite',
      method: 'delete',
      path: (c) => `/api/households/${c.householdId}/invites/${c.inviteId}`,
      owner: 204,
      member: 403,
    },
  ];

  const expected = (route: Route, actor: Actor): number => {
    if (actor === 'anonymous') return 401;
    if (actor === 'owner') return route.owner;
    if (actor === 'member') return route.member;
    return 404; // former members and outsiders cannot tell the household exists
  };

  const actors: Actor[] = ['owner', 'member', 'former member', 'outsider', 'anonymous'];
  const cases = routes.flatMap((route) =>
    actors.map((actor) => ({ route, actor, status: expected(route, actor) })),
  );

  it.each(cases)('$route.name as $actor -> $status', async ({ route, actor, status }) => {
    const former = await createTestUser('Former');
    const outsider = await createTestUser('Outsider');
    const householdId = await createHousehold(app, anna);
    await join(app, anna, householdId, bela);
    await join(app, anna, householdId, former);
    await request(app)
      .post(`/api/households/${householdId}/leave`)
      .set('Authorization', await bearer(former))
      .expect(204);
    const { invite } = await createInvite(app, anna, householdId);
    // The outsider owns another household, so they are a real, active user.
    await createHousehold(app, outsider, 'Elsewhere');

    const users: Record<Exclude<Actor, 'anonymous'>, TestUser> = {
      owner: anna,
      member: bela,
      'former member': former,
      outsider,
    };
    const ctx: Context = { householdId, memberId: bela.id, inviteId: invite.id };

    let req = request(app)[route.method](route.path(ctx));
    if (actor !== 'anonymous') req = req.set('Authorization', await bearer(users[actor]));
    const res = await (route.body ? req.send(route.body) : req);

    expect(res.status).toBe(status);
    if (status === 404) expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
    if (status === 403) expect(errorCode(res)).toBe('FORBIDDEN');
  });
});

describe('last owner rule', () => {
  it('blocks the only owner from leaving or demoting themselves, even when alone', async () => {
    const id = await createHousehold(app, anna);

    const leave = await request(app)
      .post(`/api/households/${id}/leave`)
      .set('Authorization', await bearer(anna))
      .expect(409);
    expect(errorCode(leave)).toBe('LAST_OWNER');

    await join(app, anna, id, bela);
    const demote = await setRole(app, anna, id, anna, 'member');
    expect(demote.status).toBe(409);
    expect(errorCode(demote)).toBe('LAST_OWNER');
    expect(await activeOwnerCount(id)).toBe(1);
  });

  it('allows leaving and demotion once another owner exists', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);

    const promote = await setRole(app, anna, id, bela, 'owner');
    expect(memberResponseSchema.parse(promote.body).member).toMatchObject({
      userId: bela.id,
      displayName: 'Bela',
      role: 'owner',
    });

    expect((await setRole(app, bela, id, anna, 'member')).status).toBe(200);
    await request(app)
      .post(`/api/households/${id}/leave`)
      .set('Authorization', await bearer(anna))
      .expect(204);
    expect(await activeOwnerCount(id)).toBe(1);
  });

  it('keeps one owner when two owners demote each other at the same time', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);
    await setRole(app, anna, id, bela, 'owner');

    const results = await Promise.all([
      setRole(app, anna, id, bela, 'member'),
      setRole(app, bela, id, anna, 'member'),
    ]);

    // Serialized by the household row lock: the second caller is no longer an owner.
    // Without the lock both would see two owners and both demotions would succeed.
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 403]);
    expect(await activeOwnerCount(id)).toBe(1);
  });

  it('keeps one owner when two owners step down at the same time', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);
    await setRole(app, anna, id, bela, 'owner');

    const [stepDown, leave] = await Promise.all([
      setRole(app, anna, id, anna, 'member'),
      request(app)
        .post(`/api/households/${id}/leave`)
        .set('Authorization', await bearer(bela)),
    ]);

    // One succeeds, the other then sees a single owner left.
    expect([stepDown.status, leave.status]).toEqual(
      stepDown.status === 200 ? [200, 409] : [409, 204],
    );
    expect(await activeOwnerCount(id)).toBe(1);
  });

  it('lets the sole owner archive instead, which hides the household from everyone', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);
    await request(app)
      .delete(`/api/households/${id}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    for (const user of [anna, bela]) {
      const res = await request(app)
        .get(`/api/households/${id}`)
        .set('Authorization', await bearer(user))
        .expect(404);
      expect(errorCode(res)).toBe('HOUSEHOLD_NOT_FOUND');
    }
    const [row] = await db.select().from(households).where(eq(households.id, id));
    expect(row?.archivedAt).toBeInstanceOf(Date);
  });
});

describe('member management', () => {
  it('removing a member ends the membership but keeps the row', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);

    await request(app)
      .delete(`/api/households/${id}/members/${bela.id}`)
      .set('Authorization', await bearer(anna))
      .expect(204);

    await request(app)
      .get(`/api/households/${id}`)
      .set('Authorization', await bearer(bela))
      .expect(404);
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, id), eq(householdMembers.userId, bela.id)));
    expect(row?.leftAt).toBeInstanceOf(Date);
  });

  it('rejects removing yourself, unknown members and malformed ids', async () => {
    const id = await createHousehold(app, anna);
    const outsider = await createTestUser('Outsider');

    const self = await request(app)
      .delete(`/api/households/${id}/members/${anna.id}`)
      .set('Authorization', await bearer(anna))
      .expect(400);
    expect(errorCode(self)).toBe('CANNOT_REMOVE_SELF');

    const unknown = await request(app)
      .delete(`/api/households/${id}/members/${outsider.id}`)
      .set('Authorization', await bearer(anna))
      .expect(404);
    expect(errorCode(unknown)).toBe('MEMBER_NOT_FOUND');

    const malformed = await setRole(app, anna, id, { id: 'nope', displayName: '' }, 'owner');
    expect(malformed.status).toBe(404);
    expect(errorCode(malformed)).toBe('MEMBER_NOT_FOUND');
  });

  it('revokes the pending invites of an owner who is removed or demoted', async () => {
    const id = await createHousehold(app, anna);
    await join(app, anna, id, bela);
    await setRole(app, anna, id, bela, 'owner');
    const fromBela = await createInvite(app, bela, id);
    const fromAnna = await createInvite(app, anna, id);

    await setRole(app, anna, id, bela, 'member');

    const [belas] = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, fromBela.invite.id));
    const [annas] = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, fromAnna.invite.id));
    expect(belas?.revokedAt).toBeInstanceOf(Date);
    expect(annas?.revokedAt).toBeNull();
  });
});

describe('database-level protection', () => {
  it('rejects an invite whose creator is a member of a different household (composite FK)', async () => {
    const annasHome = await createHousehold(app, anna);
    const belasHome = await createHousehold(app, bela);

    const error = await pgErrorOf(
      db.insert(householdInvites).values({
        householdId: annasHome,
        tokenHash: 'x',
        createdBy: bela.id, // an owner, but of belasHome
        expiresAt: new Date(),
      }),
    );
    expect(error).toMatchObject({
      code: '23503',
      constraint: 'household_invites_created_by_member_fk',
    });

    // Same people, matching household: accepted.
    await db.insert(householdInvites).values({
      householdId: belasHome,
      tokenHash: 'y',
      createdBy: bela.id,
      expiresAt: new Date(),
    });
  });

  it('rejects an accepter who is not a member of the invite household (composite FK)', async () => {
    const id = await createHousehold(app, anna);
    const { invite } = await createInvite(app, anna, id);

    const error = await pgErrorOf(
      db
        .update(householdInvites)
        .set({ acceptedBy: bela.id, acceptedAt: new Date() })
        .where(eq(householdInvites.id, invite.id)),
    );
    expect(error).toMatchObject({
      code: '23503',
      constraint: 'household_invites_accepted_by_member_fk',
    });
  });

  it('enforces the household name length', async () => {
    const error = await pgErrorOf(
      db.insert(households).values({ name: 'x'.repeat(61), createdBy: anna.id }),
    );
    expect(error).toMatchObject({ code: '23514', constraint: 'households_name_length' });
  });
});
