import { type FakeLogin, type FakeOidc, startFakeOidc } from '@splinance/fake-oidc';
import {
  accountResponseSchema,
  authResponseSchema,
  providerRedirectResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { errorCode } from '../../../test/households';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { sessions, userIdentities, users } from '../../db/schema';
import { createSession } from '../auth/auth.service';
import { FLOW_COOKIE } from '../auth/oauth/cookies';
import { createOidcProvider } from '../auth/oauth/providers';
import { REFRESH_COOKIE } from '../auth/refresh-cookie';
import { RECENT_SIGN_IN_MS } from './account.service';

type App = ReturnType<typeof createApp>;

const APP_ORIGIN = 'http://localhost:5173';
const CLIENT = { clientId: 'splinance-test.apps.example', clientSecret: 'fake-client-secret' };
const PASSWORD = 'correct horse battery';

let google: FakeOidc;
let other: FakeOidc;

beforeAll(async () => {
  [google, other] = await Promise.all([startFakeOidc(CLIENT), startFakeOidc(CLIENT)]);
});

afterAll(async () => {
  await Promise.all([google.close(), other.close()]);
});

function provider(id: string, fake: FakeOidc) {
  return createOidcProvider({
    id,
    issuer: new URL(fake.issuer),
    ...CLIENT,
    scopes: ['openid', 'email', 'profile'],
    linkByEmail: true,
  });
}

let app: App;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({
    oauth: {
      appOrigin: APP_ORIGIN,
      providers: [provider('google', google), provider('other', other)],
    },
  });
});

function setCookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? header.filter((c): c is string => typeof c === 'string') : [];
}

function cookiePair(res: request.Response, name: string): string | undefined {
  const pair = setCookies(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];
  return pair && pair !== `${name}=` ? pair : undefined;
}

function location(res: request.Response): URL {
  return new URL(String(res.headers.location), APP_ORIGIN);
}

interface Device {
  userId: string;
  auth: string;
  refreshCookie: string;
}

async function passwordAccount(email = 'anna@example.com'): Promise<Device> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, displayName: 'Anna' })
    .expect(201);
  const body = authResponseSchema.parse(res.body);
  const refreshCookie = cookiePair(res, REFRESH_COOKIE);
  if (!refreshCookie) throw new Error('no refresh cookie');
  return { userId: body.user.id, auth: `Bearer ${body.accessToken}`, refreshCookie };
}

/** An account without a password, connected to `providers` (sub `<provider>-gabor`). */
async function providerOnly(providers: string[], ageMs = 0): Promise<Device> {
  const [user] = await db
    .insert(users)
    .values({ email: 'gabor@example.com', passwordHash: null, displayName: 'Gábor' })
    .returning();
  if (!user) throw new Error('no user');
  for (const id of providers) {
    await db
      .insert(userIdentities)
      .values({ userId: user.id, provider: id, subject: `${id}-gabor` });
  }
  const result = await createSession(db, user);
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - ageMs) })
    .where(eq(sessions.userId, user.id));
  if (!result.refreshCookie) throw new Error('no session');
  return {
    userId: user.id,
    auth: `Bearer ${result.accessToken}`,
    refreshCookie: `${REFRESH_COOKIE}=${result.refreshCookie.token}`,
  };
}

function post(path: string, device: Device, body: object = {}) {
  return request(app).post(`/api/account${path}`).set('Authorization', device.auth).send(body);
}

/** The browser at the provider (as `login`), then back at our callback with the flow cookie. */
async function roundTrip(res: request.Response, fake: FakeOidc, login: FakeLogin) {
  const { authorizationUrl } = providerRedirectResponseSchema.parse(res.body);
  const flowCookie = cookiePair(res, FLOW_COOKIE);
  if (!flowCookie) throw new Error('no flow cookie');
  fake.nextLogin(login);
  const atProvider = await fetch(authorizationUrl, { redirect: 'manual' });
  expect(atProvider.status).toBe(302);
  const back = new URL(atProvider.headers.get('location') ?? '');
  return request(app).get(`${back.pathname}${back.search}`).set('Cookie', flowCookie);
}

async function identities(userId: string) {
  return db.select().from(userIdentities).where(eq(userIdentities.userId, userId));
}

const googleLogin = (sub = 'google-anna'): FakeLogin => ({
  sub,
  email: 'anna.k@gmail.com',
  emailVerified: true,
  name: 'Anna K',
});

describe('connect', () => {
  it('connects a provider account to the signed-in user after the password', async () => {
    const anna = await passwordAccount();
    const start = await post('/identities/google/connect', anna, { currentPassword: PASSWORD });
    expect(start.status).toBe(200);
    expect(new URL(providerRedirectResponseSchema.parse(start.body).authorizationUrl).origin).toBe(
      new URL(google.issuer).origin,
    );

    // Another email than the Splinance account is fine: matching is by sub.
    const done = await roundTrip(start, google, googleLogin());
    expect(done.status).toBe(303);
    expect(location(done).pathname).toBe('/account');
    expect(Object.fromEntries(location(done).searchParams)).toEqual({ connected: 'google' });
    // No new session: the person stays in the one that started.
    expect(cookiePair(done, REFRESH_COOKIE)).toBeUndefined();

    expect((await identities(anna.userId)).map((i) => i.subject)).toEqual(['google-anna']);

    // Signing in with Google now reaches Anna's account.
    google.nextLogin(googleLogin());
    const signIn = await request(app).get('/api/auth/oauth/google/start').expect(303);
    const back = await fetch(String(signIn.headers.location), { redirect: 'manual' });
    const url = new URL(back.headers.get('location') ?? '');
    const callback = await request(app)
      .get(`${url.pathname}${url.search}`)
      .set('Cookie', cookiePair(signIn, FLOW_COOKIE) ?? '');
    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair(callback, REFRESH_COOKIE) ?? '')
      .expect(200);
    expect(authResponseSchema.parse(refreshed.body).user.id).toBe(anna.userId);
  });

  it('needs the current password and refuses a provider that is already connected', async () => {
    const anna = await passwordAccount();
    for (const body of [{}, { currentPassword: 'wrong one' }]) {
      const res = await post('/identities/google/connect', anna, body).expect(400);
      expect(errorCode(res)).toBe('WRONG_PASSWORD');
    }
    await db
      .insert(userIdentities)
      .values({ userId: anna.userId, provider: 'google', subject: 'g' });
    const res = await post('/identities/google/connect', anna, { currentPassword: PASSWORD });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('ALREADY_CONNECTED');
    expect(errorCode(await post('/identities/nope/connect', anna).expect(404))).toBe('NOT_FOUND');
  });

  it('refuses a provider account that belongs to someone else', async () => {
    await providerOnly(['google']);
    const anna = await passwordAccount();
    const start = await post('/identities/google/connect', anna, { currentPassword: PASSWORD });
    const done = await roundTrip(start, google, googleLogin('google-gabor'));
    expect(Object.fromEntries(location(done).searchParams)).toEqual({ oauth_error: 'taken' });
    expect(location(done).pathname).toBe('/account');
    expect(await identities(anna.userId)).toEqual([]);
  });

  it('binds the callback to the session that started it', async () => {
    const anna = await passwordAccount();
    const start = await post('/identities/google/connect', anna, { currentPassword: PASSWORD });
    // Logged out meanwhile (or signed out by a password change elsewhere).
    await request(app).post('/api/auth/logout').set('Cookie', anna.refreshCookie).expect(204);
    const done = await roundTrip(start, google, googleLogin());
    expect(Object.fromEntries(location(done).searchParams)).toEqual({ oauth_error: 'expired' });
    expect(await identities(anna.userId)).toEqual([]);
  });

  it('cannot be started from the public sign-in link', async () => {
    const anna = await passwordAccount();
    const start = await request(app)
      .get('/api/auth/oauth/google/start?intent=connect')
      .set('Authorization', anna.auth)
      .expect(303);
    google.nextLogin(googleLogin());
    const back = await fetch(String(start.headers.location), { redirect: 'manual' });
    const url = new URL(back.headers.get('location') ?? '');
    const done = await request(app)
      .get(`${url.pathname}${url.search}`)
      .set('Cookie', cookiePair(start, FLOW_COOKIE) ?? '');
    // A plain sign-in: a new Google account becomes a new user, nothing is added to Anna.
    expect(location(done).pathname).toBe('/login');
    expect(await identities(anna.userId)).toEqual([]);
  });
});

describe('reauth', () => {
  it('gives an account without a password a fresh session to set one', async () => {
    const gabor = await providerOnly(['google'], RECENT_SIGN_IN_MS + 60_000);
    const stale = await post('/password', gabor, { newPassword: 'violet tram morning' });
    expect(errorCode(stale)).toBe('REAUTH_REQUIRED');

    const start = await post('/identities/google/reauth', gabor, { redirect: '/account/password' });
    expect(start.status).toBe(200);
    const done = await roundTrip(start, google, {
      sub: 'google-gabor',
      email: 'g@gmail.com',
      emailVerified: true,
    });
    expect(done.status).toBe(303);
    expect(String(done.headers.location)).toBe('/account/password');

    // The old session is gone, the new one is recent.
    await request(app).post('/api/auth/refresh').set('Cookie', gabor.refreshCookie).expect(401);
    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair(done, REFRESH_COOKIE) ?? '')
      .expect(200);
    const fresh = {
      ...gabor,
      auth: `Bearer ${authResponseSchema.parse(refreshed.body).accessToken}`,
    };
    const account = await request(app)
      .get('/api/account')
      .set('Authorization', fresh.auth)
      .expect(200);
    expect(accountResponseSchema.parse(account.body).recentSignIn).toBe(true);
    await post('/password', fresh, { newPassword: 'violet tram morning' }).expect(204);
  });

  it('refuses another provider account than the connected one', async () => {
    const gabor = await providerOnly(['google'], RECENT_SIGN_IN_MS + 60_000);
    const start = await post('/identities/google/reauth', gabor);
    const done = await roundTrip(start, google, googleLogin('someone-else'));
    expect(Object.fromEntries(location(done).searchParams)).toEqual({
      oauth_error: 'wrong_account',
    });
    expect(cookiePair(done, REFRESH_COOKIE)).toBeUndefined();
    // The session that started it still works.
    await request(app).post('/api/auth/refresh').set('Cookie', gabor.refreshCookie).expect(200);
  });

  it('only works with a connected provider and keeps the destination in the app', async () => {
    const anna = await passwordAccount();
    expect(errorCode(await post('/identities/google/reauth', anna).expect(404))).toBe(
      'IDENTITY_NOT_FOUND',
    );
    const gabor = await providerOnly(['google']);
    const start = await post('/identities/google/reauth', gabor, {
      redirect: 'https://evil.example/',
    });
    const done = await roundTrip(start, google, {
      sub: 'google-gabor',
      email: 'g@gmail.com',
      emailVerified: true,
    });
    expect(String(done.headers.location)).toBe('/');
  });
});

describe('disconnect', () => {
  it('disconnects after the password and signs out other devices', async () => {
    const anna = await passwordAccount();
    await db
      .insert(userIdentities)
      .values({ userId: anna.userId, provider: 'google', subject: 'g' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'anna@example.com', password: PASSWORD })
      .expect(200);

    expect(errorCode(await post('/identities/google/disconnect', anna).expect(400))).toBe(
      'WRONG_PASSWORD',
    );
    await post('/identities/google/disconnect', anna, { currentPassword: PASSWORD }).expect(204);
    expect(await identities(anna.userId)).toEqual([]);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair(login, REFRESH_COOKIE) ?? '')
      .expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', anna.refreshCookie).expect(200);
    expect(
      errorCode(
        await post('/identities/google/disconnect', anna, { currentPassword: PASSWORD }).expect(
          404,
        ),
      ),
    ).toBe('IDENTITY_NOT_FOUND');
  });

  it('never removes the last way to sign in', async () => {
    const gabor = await providerOnly(['google']);
    const res = await post('/identities/google/disconnect', gabor).expect(409);
    expect(errorCode(res)).toBe('LAST_SIGN_IN_METHOD');
    expect(await identities(gabor.userId)).toHaveLength(1);
  });

  it('lets only one of two parallel disconnects through when nothing else is left', async () => {
    const gabor = await providerOnly(['google', 'other']);
    const results = await Promise.all([
      post('/identities/google/disconnect', gabor),
      post('/identities/other/disconnect', gabor),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(await identities(gabor.userId)).toHaveLength(1);
  });

  it('asks an account without a password to sign in again after a while', async () => {
    const gabor = await providerOnly(['google', 'other'], RECENT_SIGN_IN_MS + 60_000);
    const res = await post('/identities/other/disconnect', gabor).expect(403);
    expect(errorCode(res)).toBe('REAUTH_REQUIRED');
  });
});

describe('on the demo instance', () => {
  it('closes connect, reauth and disconnect', async () => {
    const anna = await passwordAccount();
    const demo = createApp({ demo: { ttlDays: 7, maxActive: 10 } });
    for (const action of ['connect', 'reauth', 'disconnect']) {
      const res = await request(demo)
        .post(`/api/account/identities/google/${action}`)
        .set('Authorization', anna.auth)
        .send({ currentPassword: PASSWORD })
        .expect(403);
      expect(errorCode(res)).toBe('DEMO_MODE');
    }
  });
});
