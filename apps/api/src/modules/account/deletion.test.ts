import {
  accountDeletionPreviewSchema,
  authResponseSchema,
  balancesResponseSchema,
  householdDetailResponseSchema,
  transactionListResponseSchema,
} from '@splinance/shared';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { createHousehold, errorCode, join, leave, settleUp } from '../../../test/households';
import { type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db } from '../../db/client';
import {
  auditLog,
  householdInvites,
  householdMembers,
  households,
  importBatches,
  recurringSeries,
  sessions,
  transactions,
  userIdentities,
  users,
} from '../../db/schema';
import { REFRESH_COOKIE } from '../auth/refresh-cookie';
import { eraseAccount, FORMER_MEMBER_NAME } from './deletion.service';

type App = ReturnType<typeof createApp>;

const PASSWORD = 'correct horse battery';

interface Person extends TestUser {
  email: string;
  auth: string;
  refreshCookie: string;
}

let app: App;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

async function person(displayName: string): Promise<Person> {
  const email = `${displayName.toLowerCase()}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, displayName })
    .expect(201);
  const body = authResponseSchema.parse(res.body);
  const header = res.headers['set-cookie'] as unknown;
  const cookie = (Array.isArray(header) ? (header as string[]) : []).find((c) =>
    c.startsWith(`${REFRESH_COOKIE}=`),
  );
  return {
    id: body.user.id,
    displayName,
    email,
    auth: `Bearer ${body.accessToken}`,
    refreshCookie: cookie?.split(';')[0] ?? '',
  };
}

async function addTransaction(householdId: string, by: Person, body: Record<string, unknown>) {
  const res = await request(app)
    .post(`/api/households/${householdId}/transactions`)
    .set('Authorization', by.auth)
    .send({
      kind: 'expense',
      amount: 10_000,
      occurredOn: '2026-10-10',
      description: 'Shop',
      categoryId: null,
      ...body,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { transaction: { id: string } }).transaction.id;
}

const shared = (paidBy: Person, among: Person[]) => ({
  visibility: 'shared',
  paidBy: paidBy.id,
  split: { method: 'equal', userIds: among.map((p) => p.id) },
});

function preview(who: Person) {
  return request(app).get('/api/account/deletion').set('Authorization', who.auth);
}

function remove(who: Person, body: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/account/delete')
    .set('Authorization', who.auth)
    .send({ currentPassword: PASSWORD, confirmEmail: who.email, ...body });
}

/**
 * Anna's world: Home with Ben (a shared expense, settled; a private one; a pending invite;
 * an import), her flat (only ever her), and the old place (Cara left).
 */
async function annasWorld() {
  const [anna, ben, cara] = [await person('Anna'), await person('Ben'), await person('Cara')];
  const home = await createHousehold(app, anna, 'Home');
  await join(app, anna, home, ben);
  // Two owners, so Anna is not the last one.
  await request(app)
    .patch(`/api/households/${home}/members/${ben.id}`)
    .set('Authorization', anna.auth)
    .send({ role: 'owner' })
    .expect(200);
  const sharedId = await addTransaction(home, anna, {
    ...shared(anna, [anna, ben]),
    description: 'Groceries',
  });
  await settleUp(app, home, ben);
  const privateId = await addTransaction(home, anna, {
    visibility: 'private',
    description: 'Birthday present for Ben',
  });
  await request(app)
    .post(`/api/households/${home}/invites`)
    .set('Authorization', anna.auth)
    .expect(201);
  await db.insert(importBatches).values({
    householdId: home,
    createdBy: anna.id,
    source: 'revolut',
    fileName: 'anna-statement.csv',
    rowCount: 0,
  });

  // A recurring payment of her own and one she set up for the household.
  for (const userId of [anna.id, null]) {
    await db.insert(recurringSeries).values({
      householdId: home,
      userId,
      status: 'active',
      source: 'manual',
      name: userId ? 'Therapy' : 'Netflix',
      pattern: userId ? 'therapy' : 'netflix',
      patternKey: userId ? 'therapy' : 'netflix',
      cadence: 'monthly',
      amount: 4_490,
      currency: 'HUF',
      anchorOn: '2026-10-07',
      createdBy: anna.id,
    });
  }

  const flat = await createHousehold(app, anna, 'Annas flat');
  await addTransaction(flat, anna, { visibility: 'private', description: 'Rent' });

  const oldPlace = await createHousehold(app, anna, 'Old place');
  await join(app, anna, oldPlace, cara);
  await leave(app, oldPlace, cara);

  return { anna, ben, cara, home, flat, oldPlace, sharedId, privateId };
}

describe('preview', () => {
  it('lists what would happen per household', async () => {
    const { anna, home, flat, oldPlace } = await annasWorld();
    const body = accountDeletionPreviewSchema.parse((await preview(anna).expect(200)).body);
    expect(body).toEqual({
      blockers: [],
      leaves: [{ householdId: home, householdName: 'Home' }],
      deletes: [{ householdId: flat, householdName: 'Annas flat' }],
      archives: [{ householdId: oldPlace, householdName: 'Old place' }],
      privateTransactionCount: 2,
    });
  });

  it('names the blockers: an open balance and being the only owner', async () => {
    const [anna, ben] = [await person('Anna'), await person('Ben')];
    const home = await createHousehold(app, anna, 'Home');
    await join(app, anna, home, ben);
    await addTransaction(home, anna, shared(anna, [anna, ben]));

    const body = accountDeletionPreviewSchema.parse((await preview(anna).expect(200)).body);
    expect(body.blockers.map((b) => b.code).sort()).toEqual(['LAST_OWNER', 'UNSETTLED_BALANCE']);
    // Ben owes too, but he is not the only owner.
    const bens = accountDeletionPreviewSchema.parse((await preview(ben).expect(200)).body);
    expect(bens.blockers.map((b) => b.code)).toEqual(['UNSETTLED_BALANCE']);
  });
});

describe('delete', () => {
  it('needs the password and the email typed again', async () => {
    const anna = await person('Anna');
    expect(errorCode(await remove(anna, { currentPassword: 'nope' }).expect(400))).toBe(
      'WRONG_PASSWORD',
    );
    expect(errorCode(await remove(anna, { confirmEmail: 'ana@example.com' }).expect(400))).toBe(
      'CONFIRMATION_MISMATCH',
    );
    // Typed with other case and spaces still matches (emails are lowercased).
    await remove(anna, { confirmEmail: '  Anna@Example.com ' }).expect(204);
  });

  it('refuses while a blocker exists and changes nothing', async () => {
    const [anna, ben] = [await person('Anna'), await person('Ben')];
    const home = await createHousehold(app, anna, 'Home');
    await join(app, anna, home, ben);
    await addTransaction(home, ben, shared(ben, [anna, ben]));

    const res = await remove(anna).expect(409);
    expect(errorCode(res)).toBe('UNSETTLED_BALANCE');
    const [row] = await db.select().from(users).where(eq(users.id, anna.id));
    expect(row?.deletedAt).toBeNull();
    expect(row?.email).toBe('anna@example.com');
  });

  it('erases the person and keeps what the others need', async () => {
    const world = await annasWorld();
    const { anna, ben, home, flat, oldPlace, sharedId, privateId } = world;
    await db
      .insert(userIdentities)
      .values({ userId: anna.id, provider: 'google', subject: 'g-anna' });

    const res = await remove(anna).expect(204);
    expect(String(res.headers['set-cookie'])).toContain(`${REFRESH_COOKIE}=;`);

    // The row stays, with nothing personal; credentials are gone.
    const [row] = await db.select().from(users).where(eq(users.id, anna.id));
    expect(row).toMatchObject({
      displayName: FORMER_MEMBER_NAME,
      email: `deleted-${anna.id}@deleted.invalid`,
      passwordHash: null,
    });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(
      await db.select().from(userIdentities).where(eq(userIdentities.userId, anna.id)),
    ).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, anna.id))).toEqual([]);
    await request(app).post('/api/auth/refresh').set('Cookie', anna.refreshCookie).expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'anna@example.com', password: PASSWORD })
      .expect(401);

    // Ben still sees the shared history, under "Former member", and nothing is open.
    const list = await request(app)
      .get(`/api/households/${home}/transactions`)
      .query({ month: '2026-10' })
      .set('Authorization', ben.auth)
      .expect(200);
    const listed = transactionListResponseSchema.parse(list.body).transactions;
    expect(listed.map((t) => [t.id, t.paidBy.displayName])).toEqual([
      [sharedId, FORMER_MEMBER_NAME],
    ]);
    const balances = await request(app)
      .get(`/api/households/${home}/balances`)
      .set('Authorization', ben.auth)
      .expect(200);
    expect(balancesResponseSchema.parse(balances.body).balances.debts).toEqual([]);
    const detail = await request(app)
      .get(`/api/households/${home}`)
      .set('Authorization', ben.auth)
      .expect(200);
    expect(
      householdDetailResponseSchema.parse(detail.body).household.members.map((m) => m.displayName),
    ).toEqual(['Ben']);

    // Private transactions and their audit rows are gone; the shared one's history stays.
    expect(await db.select().from(transactions).where(eq(transactions.id, privateId))).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, privateId))).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, sharedId))).not.toEqual([]);

    // Her pending invite is revoked, her import keeps its rows but loses the file name.
    const invites = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.createdBy, anna.id));
    const pending = invites.filter((i) => i.acceptedAt === null);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((i) => i.revokedAt !== null)).toBe(true);
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.createdBy, anna.id));
    expect(batch?.fileName).toBeNull();

    // Her private recurring payment is gone; the household's stays.
    expect(
      (await db.select().from(recurringSeries).where(eq(recurringSeries.householdId, home))).map(
        (r) => r.name,
      ),
    ).toEqual(['Netflix']);

    // Her flat is gone whole, the old place is archived, her memberships ended.
    expect(await db.select().from(households).where(eq(households.id, flat))).toEqual([]);
    expect(
      await db.select().from(householdMembers).where(eq(householdMembers.householdId, flat)),
    ).toEqual([]);
    const [old] = await db.select().from(households).where(eq(households.id, oldPlace));
    expect(old?.archivedAt).toBeInstanceOf(Date);
    const active = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.userId, anna.id),
          inArray(householdMembers.householdId, [home, oldPlace]),
        ),
      );
    expect(active.every((m) => m.leftAt !== null)).toBe(true);

    // The address is free again.
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'anna@example.com', password: PASSWORD, displayName: 'Anna' })
      .expect(201);
  });

  it('leaves nothing usable to a still-valid access token', async () => {
    const [anna, ben] = [await person('Anna'), await person('Ben')];
    const home = await createHousehold(app, anna, 'Home');
    const invite = await request(app)
      .post(`/api/households/${home}/invites`)
      .set('Authorization', anna.auth);
    const { token } = invite.body as { token: string };
    await remove(ben).expect(204);

    expect(
      errorCode(await request(app).get('/api/me').set('Authorization', ben.auth).expect(401)),
    ).toBe('UNAUTHENTICATED');
    await request(app)
      .post('/api/households')
      .set('Authorization', ben.auth)
      .send({ name: 'New' })
      .expect(401);
    await request(app)
      .post(`/api/invites/${token}/accept`)
      .set('Authorization', ben.auth)
      .expect(401);
    await request(app).get('/api/account').set('Authorization', ben.auth).expect(401);
  });

  it('cannot race a new expense that names the person', async () => {
    const [anna, ben] = [await person('Anna'), await person('Ben')];
    const home = await createHousehold(app, anna, 'Home');
    await join(app, anna, home, ben);
    const [deleted, expense] = await Promise.all([
      remove(ben),
      request(app)
        .post(`/api/households/${home}/transactions`)
        .set('Authorization', anna.auth)
        .send({
          kind: 'expense',
          amount: 10_000,
          occurredOn: '2026-10-10',
          description: 'Shop',
          categoryId: null,
          ...shared(anna, [anna, ben]),
        }),
    ]);
    // Either Ben is gone first (the expense is refused) or the expense is first (Ben owes).
    expect([deleted.status, expense.status].sort()).not.toEqual([201, 204]);
    expect(deleted.status === 204 || expense.status === 201).toBe(true);
  });

  it('is closed on the demo instance', async () => {
    const anna = await person('Anna');
    const demo = createApp({ demo: { ttlDays: 7, maxActive: 10 } });
    const res = await request(demo)
      .post('/api/account/delete')
      .set('Authorization', anna.auth)
      .send({ currentPassword: PASSWORD, confirmEmail: anna.email })
      .expect(403);
    expect(errorCode(res)).toBe('DEMO_MODE');
  });
});

describe('eraseAccount (restore runbook)', () => {
  it('repeats a deletion without the person and skips one already done', async () => {
    const { anna } = await annasWorld();
    expect(await eraseAccount(anna.id)).toEqual({
      householdsLeft: 1,
      householdsDeleted: 1,
      householdsArchived: 1,
      privateTransactionsDeleted: 2,
    });
    expect(await eraseAccount(anna.id)).toBeNull();
  });
});
