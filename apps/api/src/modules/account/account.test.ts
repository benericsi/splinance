import {
  accountResponseSchema,
  authResponseSchema,
  householdDetailResponseSchema,
  profileResponseSchema,
  revokeSessionsResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { createHousehold, errorCode } from '../../../test/households';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { sessions, userIdentities, users } from '../../db/schema';
import { createSession } from '../auth/auth.service';
import { createOidcProvider } from '../auth/oauth/providers';
import { REFRESH_COOKIE } from '../auth/refresh-cookie';
import { RECENT_SIGN_IN_MS } from './account.service';

type App = ReturnType<typeof createApp>;

const anna = { email: 'anna@example.com', password: 'correct horse battery', displayName: 'Anna' };
const NEW_PASSWORD = 'violet tram morning';

/** A signed-in browser: its access token and refresh cookie. */
interface Device {
  userId: string;
  auth: string;
  refreshToken: string;
}

function refreshTokenFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  const token = cookie?.split(';')[0]?.slice(REFRESH_COOKIE.length + 1);
  if (!token) throw new Error('no refresh cookie');
  return token;
}

function device(res: request.Response): Device {
  const body = authResponseSchema.parse(res.body);
  return {
    userId: body.user.id,
    auth: `Bearer ${body.accessToken}`,
    refreshToken: refreshTokenFrom(res),
  };
}

async function registerAnna(app: App): Promise<Device> {
  return device(await request(app).post('/api/auth/register').send(anna).expect(201));
}

function login(app: App, password = anna.password) {
  return request(app).post('/api/auth/login').send({ email: anna.email, password });
}

function refresh(app: App, token: string) {
  return request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${token}`);
}

function changePassword(app: App, auth: string, body: object) {
  return request(app).post('/api/account/password').set('Authorization', auth).send(body);
}

/** An account that signs in only with Google, signed in `ageMs` ago. */
async function googleOnly(ageMs = 0): Promise<Device & { sessionId: string }> {
  const [user] = await db
    .insert(users)
    .values({ email: 'gabor@example.com', passwordHash: null, displayName: 'Gábor' })
    .returning();
  if (!user) throw new Error('no user');
  await db.insert(userIdentities).values({ userId: user.id, provider: 'google', subject: 'g-1' });
  const result = await createSession(db, user);
  const [session] = await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - ageMs) })
    .where(eq(sessions.userId, user.id))
    .returning();
  if (!session || !result.refreshCookie) throw new Error('no session');
  return {
    userId: user.id,
    sessionId: session.id,
    auth: `Bearer ${result.accessToken}`,
    refreshToken: result.refreshCookie.token,
  };
}

let app: App;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

describe('GET /api/account', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).get('/api/account').expect(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('describes a password account', async () => {
    const annaDevice = await registerAnna(app);
    const res = await request(app)
      .get('/api/account')
      .set('Authorization', annaDevice.auth)
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = accountResponseSchema.parse(res.body);
    expect(body).toMatchObject({
      user: { email: anna.email, displayName: 'Anna' },
      hasPassword: true,
      identities: [],
      providers: [],
    });
  });

  it('lists connected providers and the ones this instance offers', async () => {
    const withGoogle = createApp({
      oauth: {
        appOrigin: 'http://localhost:5173',
        providers: [
          createOidcProvider({
            id: 'google',
            // Discovery is lazy; nothing is fetched for this test.
            issuer: new URL('http://127.0.0.1:9'),
            clientId: 'id',
            clientSecret: 'secret',
            scopes: ['openid'],
            linkByEmail: true,
          }),
        ],
      },
    });
    const gabor = await googleOnly();
    const res = await request(withGoogle)
      .get('/api/account')
      .set('Authorization', gabor.auth)
      .expect(200);
    const body = accountResponseSchema.parse(res.body);
    expect(body.hasPassword).toBe(false);
    expect(body.identities.map((identity) => identity.provider)).toEqual(['google']);
    expect(body.providers).toEqual([{ id: 'google' }]);
  });
});

describe('PATCH /api/account', () => {
  it('renames the user, also as a household member', async () => {
    const annaDevice = await registerAnna(app);
    const user = { id: annaDevice.userId, displayName: 'Anna' };
    const householdId = await createHousehold(app, user);

    const res = await request(app)
      .patch('/api/account')
      .set('Authorization', annaDevice.auth)
      .send({ displayName: '  Anna K.  ' })
      .expect(200);
    expect(profileResponseSchema.parse(res.body).user.displayName).toBe('Anna K.');

    const detail = await request(app)
      .get(`/api/households/${householdId}`)
      .set('Authorization', annaDevice.auth)
      .expect(200);
    const { members } = householdDetailResponseSchema.parse(detail.body).household;
    expect(members.map((m) => m.displayName)).toEqual(['Anna K.']);
  });

  it('validates the name', async () => {
    const annaDevice = await registerAnna(app);
    for (const displayName of ['   ', 'x'.repeat(51)]) {
      const res = await request(app)
        .patch('/api/account')
        .set('Authorization', annaDevice.auth)
        .send({ displayName })
        .expect(400);
      expect(errorCode(res)).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /api/account/password', () => {
  it('changes the password and signs out the other devices only', async () => {
    const here = await registerAnna(app);
    const elsewhere = device(await login(app).expect(200));

    await changePassword(app, here.auth, {
      currentPassword: anna.password,
      newPassword: NEW_PASSWORD,
    }).expect(204);

    await refresh(app, elsewhere.refreshToken).expect(401);
    await refresh(app, here.refreshToken).expect(200);
    await login(app).expect(401);
    await login(app, NEW_PASSWORD).expect(200);
  });

  it('answers a missing or wrong current password with 400, never 401', async () => {
    const here = await registerAnna(app);
    for (const body of [
      { newPassword: NEW_PASSWORD },
      { currentPassword: 'not my password', newPassword: NEW_PASSWORD },
    ]) {
      const res = await changePassword(app, here.auth, body).expect(400);
      expect(errorCode(res)).toBe('WRONG_PASSWORD');
    }
    await login(app).expect(200);
  });

  it('applies the password rules with the account’s own email and name', async () => {
    const here = await registerAnna(app);
    const personal = await changePassword(app, here.auth, {
      currentPassword: anna.password,
      newPassword: 'anna loves trams',
    }).expect(400);
    expect(errorCode(personal)).toBe('WEAK_PASSWORD');

    const short = await changePassword(app, here.auth, {
      currentPassword: anna.password,
      newPassword: 'short',
    }).expect(400);
    expect(errorCode(short)).toBe('VALIDATION_ERROR');
  });

  it('refuses a session that has ended', async () => {
    const here = await registerAnna(app);
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${here.refreshToken}`)
      .expect(204);
    const res = await changePassword(app, here.auth, {
      currentPassword: anna.password,
      newPassword: NEW_PASSWORD,
    }).expect(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('limits failed attempts per user', async () => {
    const here = await registerAnna(app);
    for (let i = 0; i < 10; i++) {
      await changePassword(app, here.auth, {
        currentPassword: 'guess',
        newPassword: NEW_PASSWORD,
      }).expect(400);
    }
    const res = await changePassword(app, here.auth, {
      currentPassword: anna.password,
      newPassword: NEW_PASSWORD,
    }).expect(429);
    expect(errorCode(res)).toBe('RATE_LIMITED');
  });

  it('lets an account without a password set one right after signing in', async () => {
    const gabor = await googleOnly();
    await changePassword(app, gabor.auth, { newPassword: NEW_PASSWORD }).expect(204);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'gabor@example.com', password: NEW_PASSWORD })
      .expect(200);
  });

  it('asks an account without a password to sign in again after a while', async () => {
    const gabor = await googleOnly(RECENT_SIGN_IN_MS + 60_000);
    const res = await changePassword(app, gabor.auth, { newPassword: NEW_PASSWORD }).expect(403);
    expect(errorCode(res)).toBe('REAUTH_REQUIRED');
    const [user] = await db.select().from(users).where(eq(users.id, gabor.userId));
    expect(user?.passwordHash).toBeNull();
  });
});

describe('POST /api/account/sessions/revoke-others', () => {
  it('signs out every other session and keeps this one', async () => {
    const here = await registerAnna(app);
    const elsewhere = device(await login(app).expect(200));

    const res = await request(app)
      .post('/api/account/sessions/revoke-others')
      .set('Authorization', here.auth)
      .expect(200);
    expect(revokeSessionsResponseSchema.parse(res.body)).toEqual({ revoked: 1 });

    await refresh(app, elsewhere.refreshToken).expect(401);
    await refresh(app, here.refreshToken).expect(200);
  });
});

describe('on the demo instance', () => {
  it('reads the account but closes every change', async () => {
    const here = await registerAnna(app);
    const demo = createApp({ demo: { ttlDays: 7, maxActive: 10 } });

    const account = await request(demo).get('/api/account').set('Authorization', here.auth);
    expect(accountResponseSchema.parse(account.body).providers).toEqual([]);

    const writes = [
      request(demo).patch('/api/account').send({ displayName: 'Visitor' }),
      request(demo)
        .post('/api/account/password')
        .send({ currentPassword: anna.password, newPassword: NEW_PASSWORD }),
      request(demo).post('/api/account/sessions/revoke-others'),
    ];
    for (const write of writes) {
      const res = await write.set('Authorization', here.auth).expect(403);
      expect(errorCode(res)).toBe('DEMO_MODE');
    }
  });
});
