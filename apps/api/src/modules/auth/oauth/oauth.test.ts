import { type FakeLogin, type FakeOidc, startFakeOidc } from '@splinance/fake-oidc';
import {
  apiErrorResponseSchema,
  authProvidersResponseSchema,
  authResponseSchema,
  oauthPendingLinkResponseSchema,
} from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../../test/db';
import { createTestUser, pgErrorOf } from '../../../../test/users';
import { type AppDeps, createApp } from '../../../app';
import { db } from '../../../db/client';
import { userIdentities, users } from '../../../db/schema';
import { REFRESH_COOKIE } from '../refresh-cookie';
import { FLOW_COOKIE, LINK_COOKIE } from './cookies';
import { createOidcProvider, type OAuthProviderConfig } from './providers';

type App = ReturnType<typeof createApp>;

const APP_ORIGIN = 'http://localhost:5173';
const CLIENT_ID = 'splinance-test.apps.example';
const CLIENT_SECRET = 'fake-client-secret';
const CALLBACK = '/api/auth/oauth/google/callback';

let fake: FakeOidc;

beforeAll(async () => {
  fake = await startFakeOidc({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
});

afterAll(async () => {
  await fake.close();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

function google(overrides: Partial<OAuthProviderConfig> = {}) {
  return createOidcProvider({
    id: 'google',
    issuer: new URL(fake.issuer),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    scopes: ['openid', 'email', 'profile'],
    authParams: { prompt: 'select_account' },
    linkByEmail: true,
    ...overrides,
  });
}

function makeApp(overrides: Partial<AppDeps> & { provider?: OAuthProviderConfig } = {}): App {
  const { provider, ...deps } = overrides;
  return createApp({
    oauth: {
      appOrigin: APP_ORIGIN,
      providers: [provider ? createOidcProvider(provider) : google()],
    },
    ...deps,
  });
}

function setCookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header.filter((c): c is string => typeof c === 'string');
  return typeof header === 'string' ? [header] : [];
}

/** The full Set-Cookie line for `name`, if the response set (or cleared) it. */
function setCookie(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

/** `name=value` for a Cookie header, if the response set a non-empty value. */
function cookiePair(res: request.Response, name: string): string | undefined {
  const pair = setCookie(res, name)?.split(';')[0];
  return pair && pair !== `${name}=` ? pair : undefined;
}

function location(res: request.Response): URL {
  return new URL(String(res.headers.location), APP_ORIGIN);
}

async function start(app: App, query = '') {
  const res = await request(app).get(`/api/auth/oauth/google/start${query}`).expect(303);
  const flowCookie = cookiePair(res, FLOW_COOKIE);
  if (!flowCookie) throw new Error('start did not set the flow cookie');
  return { res, authorizeUrl: new URL(String(res.headers.location)), flowCookie };
}

/** What the browser does at the provider: follow the authorize URL, return the callback URL. */
async function atProvider(authorizeUrl: URL): Promise<URL> {
  const res = await fetch(authorizeUrl, { redirect: 'manual' });
  expect(res.status).toBe(302);
  return new URL(res.headers.get('location') ?? '');
}

function callback(app: App, url: URL, cookie?: string) {
  const req = request(app).get(`${url.pathname}${url.search}`);
  return cookie ? req.set('Cookie', cookie) : req;
}

/** A whole sign-in as `login`; returns the callback's response. */
async function signIn(app: App, login: FakeLogin = {}, query = '') {
  fake.nextLogin(login);
  const { authorizeUrl, flowCookie } = await start(app, query);
  return callback(app, await atProvider(authorizeUrl), flowCookie);
}

function expectLoginRedirect(res: request.Response, params: Record<string, string> = {}) {
  expect(res.status).toBe(303);
  const url = location(res);
  expect(url.pathname).toBe('/login');
  expect(Object.fromEntries(url.searchParams)).toEqual(params);
}

async function refreshWith(app: App, res: request.Response) {
  const cookie = cookiePair(res, REFRESH_COOKIE);
  if (!cookie) throw new Error('no refresh cookie');
  const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
  return authResponseSchema.parse(refreshed.body);
}

const registerPassword = (app: App, email = 'cecil@example.com') =>
  request(app)
    .post('/api/auth/register')
    .send({ email, password: 'correct horse battery', displayName: 'Cecil' })
    .expect(201);

describe('GET /api/auth/providers', () => {
  it('lists the configured providers', async () => {
    const res = await request(makeApp()).get('/api/auth/providers').expect(200);
    expect(authProvidersResponseSchema.parse(res.body)).toEqual({ providers: [{ id: 'google' }] });
  });

  it('is empty without providers and on the demo instance, where no OAuth route exists', async () => {
    const none = await request(createApp({ oauth: null }))
      .get('/api/auth/providers')
      .expect(200);
    expect(none.body).toEqual({ providers: [] });

    const demo = makeApp({ demo: { ttlDays: 7, maxActive: 10 } });
    expect((await request(demo).get('/api/auth/providers').expect(200)).body).toEqual({
      providers: [],
    });
    await request(demo).get('/api/auth/oauth/google/start').expect(404);
  });
});

describe('GET /api/auth/oauth/:provider/start', () => {
  it('redirects to the provider with PKCE, state and nonce, kept in a Lax flow cookie', async () => {
    const { res, authorizeUrl } = await start(makeApp(), '?redirect=/h/abc');

    expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe(`${fake.issuer}/authorize`);
    const params = authorizeUrl.searchParams;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('redirect_uri')).toBe(`${APP_ORIGIN}${CALLBACK}`);
    expect(params.get('scope')).toBe('openid email profile');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('prompt')).toBe('select_account');
    expect(params.get('state')).toMatch(/^[\w-]{43}$/);
    expect(params.get('nonce')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).not.toBe(params.get('nonce'));

    const cookie = setCookie(res, FLOW_COOKIE) ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/;/);
    expect(cookie).toMatch(/Max-Age=600/);
    // Encrypted: neither the verifier nor the destination is readable.
    expect(cookie).not.toContain('/h/abc');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('is 404 for an unknown provider', async () => {
    const res = await request(makeApp()).get('/api/auth/oauth/nope/start').expect(404);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('sends the person back with "unavailable" when the provider cannot be reached', async () => {
    const app = makeApp({
      provider: {
        id: 'google',
        issuer: new URL('http://localhost:1'),
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        scopes: ['openid'],
        linkByEmail: true,
      },
    });
    const res = await request(app).get('/api/auth/oauth/google/start?redirect=/h/1').expect(303);
    expectLoginRedirect(res, { oauth_error: 'unavailable', redirect: '/h/1' });
    expect(setCookie(res, FLOW_COOKIE)).toBeUndefined();
  });

  it('is rate limited per IP', async () => {
    const app = makeApp();
    for (let i = 0; i < 30; i++) await request(app).get('/api/auth/oauth/google/start').expect(303);
    await request(app).get('/api/auth/oauth/google/start').expect(429);
  });
});

describe('GET /api/auth/oauth/:provider/callback', () => {
  it('creates an account, starts a session and lands on /login with the destination', async () => {
    const app = makeApp();
    const res = await signIn(
      app,
      { sub: 'google-ben', email: 'Ben.Kovacs@Example.com', name: 'Ben Kovács' },
      '?redirect=/h/abc?month=2026-11',
    );

    expectLoginRedirect(res, { redirect: '/h/abc?month=2026-11' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(setCookie(res, FLOW_COOKIE)).toMatch(new RegExp(`^${FLOW_COOKIE}=;`));
    const refresh = setCookie(res, REFRESH_COOKIE) ?? '';
    expect(refresh).toMatch(/HttpOnly/);
    expect(refresh).toMatch(/SameSite=Strict/);
    expect(refresh).toMatch(/Path=\/api\/auth/);

    const session = await refreshWith(app, res);
    expect(session.user).toMatchObject({
      email: 'ben.kovacs@example.com',
      displayName: 'Ben Kovács',
    });

    const [user] = await db.select().from(users);
    expect(user?.passwordHash).toBeNull();
    const identities = await db.select().from(userIdentities);
    expect(identities).toEqual([
      expect.objectContaining({ userId: user?.id, provider: 'google', subject: 'google-ben' }),
    ]);
  });

  it('signs a returning person in through their identity, even with registration closed', async () => {
    await signIn(makeApp(), { sub: 'google-ben', email: 'ben@example.com' });
    const [before] = await db.select().from(userIdentities);

    const closed = makeApp({ registration: { mode: 'closed', allowlist: [] } });
    // Google may report a changed email: the account is found by sub, not by email.
    const res = await signIn(closed, { sub: 'google-ben', email: 'ben.new@example.com' });
    expectLoginRedirect(res);
    expect((await refreshWith(closed, res)).user.email).toBe('ben@example.com');

    expect(await db.select().from(users)).toHaveLength(1);
    const [after] = await db.select().from(userIdentities);
    expect(after?.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before?.lastUsedAt.getTime() ?? 0);
  });

  it('falls back to the email for the display name and drops unsafe destinations', async () => {
    const app = makeApp();
    const res = await signIn(
      app,
      { email: 'dora.explorer@example.com' },
      '?redirect=//evil.example',
    );
    expectLoginRedirect(res);
    expect((await refreshWith(app, res)).user.displayName).toBe('dora.explorer');
  });

  it('clamps a long provider name to 50 characters', async () => {
    const app = makeApp();
    const res = await signIn(app, { name: 'Ő'.repeat(60) });
    expect((await refreshWith(app, res)).user.displayName).toBe('Ő'.repeat(50));
  });

  it('applies the registration allowlist to first sign-ins', async () => {
    const app = makeApp({ registration: { mode: 'allowlist', allowlist: ['anna@example.com'] } });
    expectLoginRedirect(await signIn(app, { email: 'Anna@Example.com' }));

    const res = await signIn(app, { email: 'stranger@example.com' }, '?redirect=/h/1');
    expectLoginRedirect(res, { oauth_error: 'not_allowed', redirect: '/h/1' });
    expect(cookiePair(res, REFRESH_COOKIE)).toBeUndefined();

    const closed = makeApp({ registration: { mode: 'closed', allowlist: [] } });
    expectLoginRedirect(await signIn(closed, { email: 'x@example.com' }), {
      oauth_error: 'not_allowed',
    });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it.each([
    ['false', false],
    ['the string "true"', 'true'],
    ['missing', undefined],
  ])('refuses an email that is not verified (%s)', async (_label, emailVerified) => {
    const res = await signIn(makeApp(), { emailVerified });
    expectLoginRedirect(res, { oauth_error: 'email_unverified' });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('reports a sign-in cancelled at the provider', async () => {
    expectLoginRedirect(await signIn(makeApp(), { action: 'deny' }), { oauth_error: 'cancelled' });
  });

  describe('flow cookie and state', () => {
    it('refuses a callback without the flow cookie, before asking the provider', async () => {
      const app = makeApp();
      fake.nextLogin();
      const { authorizeUrl } = await start(app);
      const back = await atProvider(authorizeUrl);
      const before = fake.tokenRequests();

      expectLoginRedirect(await callback(app, back), { oauth_error: 'expired' });
      expect(fake.tokenRequests()).toBe(before);
    });

    it('refuses a tampered flow cookie', async () => {
      const app = makeApp();
      fake.nextLogin();
      const { authorizeUrl, flowCookie } = await start(app);
      const tampered = `${flowCookie.slice(0, -4)}AAAA`;
      expectLoginRedirect(await callback(app, await atProvider(authorizeUrl), tampered), {
        oauth_error: 'expired',
      });
    });

    it('refuses a state from another flow (login CSRF, or a newer flow in another tab)', async () => {
      const app = makeApp();
      fake.nextLogin();
      const first = await start(app);
      const second = await start(app);
      expectLoginRedirect(
        await callback(app, await atProvider(first.authorizeUrl), second.flowCookie),
        {
          oauth_error: 'expired',
        },
      );
    });

    it('refuses a flow cookie older than 10 minutes', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const app = makeApp();
      fake.nextLogin();
      const { authorizeUrl, flowCookie } = await start(app);
      const back = await atProvider(authorizeUrl);
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      expectLoginRedirect(await callback(app, back, flowCookie), { oauth_error: 'expired' });
    });

    it('cannot be replayed: the code is single use', async () => {
      const app = makeApp();
      fake.nextLogin();
      const { authorizeUrl, flowCookie } = await start(app);
      const back = await atProvider(authorizeUrl);
      expectLoginRedirect(await callback(app, back, flowCookie));
      expectLoginRedirect(await callback(app, back, flowCookie), { oauth_error: 'failed' });
    });

    it('refuses a malformed callback query', async () => {
      const app = makeApp();
      fake.nextLogin();
      const { authorizeUrl, flowCookie } = await start(app);
      const back = await atProvider(authorizeUrl);
      back.searchParams.append('code', 'second');
      expectLoginRedirect(await callback(app, back, flowCookie), { oauth_error: 'failed' });
    });
  });

  describe('ID token validation', () => {
    it.each<[string, NonNullable<FakeLogin['idToken']>]>([
      ['another audience', { claims: { aud: 'someone-else' } }],
      ['another issuer', { claims: { iss: 'https://evil.example' } }],
      ['another nonce', { claims: { nonce: 'replayed' } }],
      ['an expired token', { claims: { exp: Math.floor(Date.now() / 1000) - 3600 } }],
      ['a foreign signing key', { foreignKey: true }],
      ['no subject', { claims: { sub: undefined } }],
    ])('refuses %s', async (_label, idToken) => {
      const res = await signIn(makeApp(), { idToken });
      expectLoginRedirect(res, { oauth_error: 'failed' });
      expect(await db.select().from(users)).toHaveLength(0);
    });
  });

  it('creates one account when the same person signs in twice at once', async () => {
    const app = makeApp();
    const flows = [];
    for (let i = 0; i < 2; i++) {
      fake.nextLogin({ sub: 'google-twice', email: 'twice@example.com' });
      const { authorizeUrl, flowCookie } = await start(app);
      flows.push({ back: await atProvider(authorizeUrl), flowCookie });
    }
    const results = await Promise.all(flows.map((f) => callback(app, f.back, f.flowCookie)));
    for (const res of results) expectLoginRedirect(res);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(userIdentities)).toHaveLength(1);
  });
});

describe('connecting a provider to an existing password account', () => {
  async function pendingLink(app: App, login: FakeLogin = {}) {
    const res = await signIn(
      app,
      { sub: 'google-cecil', email: 'cecil@example.com', ...login },
      '?redirect=/h/9',
    );
    expectLoginRedirect(res, { oauth: 'link', redirect: '/h/9' });
    expect(cookiePair(res, REFRESH_COOKIE)).toBeUndefined();
    const linkCookie = cookiePair(res, LINK_COOKIE);
    if (!linkCookie) throw new Error('no link cookie');
    expect(setCookie(res, LINK_COOKIE)).toMatch(/SameSite=Strict/);
    return linkCookie;
  }

  const loginWith = (
    app: App,
    cookie: string,
    email = 'cecil@example.com',
    password = 'correct horse battery',
  ) => request(app).post('/api/auth/login').set('Cookie', cookie).send({ email, password });

  it('waits for the password, then links in the same login', async () => {
    const app = makeApp();
    await registerPassword(app);
    const linkCookie = await pendingLink(app);
    expect(await db.select().from(userIdentities)).toHaveLength(0);

    const waiting = await request(app)
      .get('/api/auth/oauth/link')
      .set('Cookie', linkCookie)
      .expect(200);
    expect(oauthPendingLinkResponseSchema.parse(waiting.body)).toEqual({
      provider: 'google',
      email: 'cecil@example.com',
    });

    const res = await loginWith(app, linkCookie).expect(200);
    expect(authResponseSchema.parse(res.body).linkedProvider).toBe('google');
    expect(setCookie(res, LINK_COOKIE)).toMatch(new RegExp(`^${LINK_COOKIE}=;`));
    expect(await db.select().from(userIdentities)).toEqual([
      expect.objectContaining({ provider: 'google', subject: 'google-cecil' }),
    ]);

    // From now on Google alone is enough.
    expectLoginRedirect(await signIn(app, { sub: 'google-cecil', email: 'cecil@example.com' }));
  });

  it('does not link on a wrong password, and keeps the link waiting', async () => {
    const app = makeApp();
    await registerPassword(app);
    const linkCookie = await pendingLink(app);
    const res = await loginWith(app, linkCookie, 'cecil@example.com', 'wrong password!').expect(
      401,
    );
    expect(setCookie(res, LINK_COOKIE)).toBeUndefined();
    expect(await db.select().from(userIdentities)).toHaveLength(0);
  });

  it('does not link when someone else logs in with the cookie', async () => {
    const app = makeApp();
    await registerPassword(app);
    await registerPassword(app, 'other@example.com');
    const linkCookie = await pendingLink(app);
    const res = await loginWith(app, linkCookie, 'other@example.com').expect(200);
    expect(authResponseSchema.parse(res.body).linkedProvider).toBeUndefined();
    expect(await db.select().from(userIdentities)).toHaveLength(0);
  });

  it('refuses when the account already has another account of this provider', async () => {
    const app = makeApp();
    await registerPassword(app);
    await loginWith(app, await pendingLink(app)).expect(200);
    const res = await signIn(app, { sub: 'google-cecil-2', email: 'cecil@example.com' });
    expectLoginRedirect(res, { oauth_error: 'conflict' });
  });

  it('refuses for providers that do not link by email, and for accounts without a password', async () => {
    const noLink = makeApp({
      provider: { ...google().config, linkByEmail: false },
    });
    await registerPassword(noLink);
    expectLoginRedirect(await signIn(noLink, { email: 'cecil@example.com' }), {
      oauth_error: 'conflict',
    });

    const app = makeApp();
    await signIn(app, { sub: 'google-a', email: 'dana@example.com' });
    expectLoginRedirect(await signIn(app, { sub: 'google-b', email: 'dana@example.com' }), {
      oauth_error: 'conflict',
    });
  });

  it('answers 404 when nothing is waiting', async () => {
    await request(makeApp()).get('/api/auth/oauth/link').expect(404);
  });
});

describe('password login for an account without a password', () => {
  it('fails like a wrong password', async () => {
    const app = makeApp();
    await signIn(app, { email: 'ben@example.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ben@example.com', password: 'anything at all' })
      .expect(401);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('user_identities constraints', () => {
  it('enforces the format, uniqueness and the user reference by name', async () => {
    const anna = await createTestUser('Anna');
    const ben = await createTestUser('Ben');
    await db.insert(userIdentities).values({ userId: anna.id, provider: 'google', subject: 's1' });

    const cases: [Promise<unknown>, string][] = [
      [
        db.insert(userIdentities).values({ userId: ben.id, provider: 'google', subject: 's1' }),
        'user_identities_provider_subject_unique',
      ],
      [
        db.insert(userIdentities).values({ userId: anna.id, provider: 'google', subject: 's2' }),
        'user_identities_user_provider_unique',
      ],
      [
        db.insert(userIdentities).values({ userId: ben.id, provider: 'Google', subject: 's3' }),
        'user_identities_provider_format',
      ],
      [
        db.insert(userIdentities).values({ userId: ben.id, provider: 'github', subject: '' }),
        'user_identities_subject_length',
      ],
      [
        db.insert(userIdentities).values({
          userId: '01900000-0000-7000-8000-000000000000',
          provider: 'github',
          subject: 's4',
        }),
        'user_identities_user_id_fk',
      ],
    ];
    for (const [query, constraint] of cases) {
      expect((await pgErrorOf(query)).constraint).toBe(constraint);
    }
  });

  it('goes with its user', async () => {
    const anna = await createTestUser('Anna');
    await db.insert(userIdentities).values({ userId: anna.id, provider: 'google', subject: 's1' });
    await db.delete(users).where(eq(users.id, anna.id));
    expect(await db.select().from(userIdentities)).toHaveLength(0);
  });
});
