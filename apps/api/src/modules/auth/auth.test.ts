import { apiErrorResponseSchema, authResponseSchema, meResponseSchema } from '@splinance/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { sessions, users } from '../../db/schema';
import { REFRESH_COOKIE } from './auth.routes';
import { REUSE_GRACE_MS } from './auth.service';
import { hashToken } from './tokens';

type App = ReturnType<typeof createApp>;

const credentials = {
  email: 'anna@example.com',
  password: 'correct horse battery',
  displayName: 'Anna',
};

function setCookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header.filter((c): c is string => typeof c === 'string');
  return typeof header === 'string' ? [header] : [];
}

/** Raw refresh token from the Set-Cookie header, or undefined if none was set. */
function refreshTokenFrom(res: request.Response): string | undefined {
  const cookie = setCookies(res).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  const value = cookie?.split(';')[0]?.slice(REFRESH_COOKIE.length + 1);
  return value || undefined;
}

/** Parses the body with the shared error contract and returns its code. */
function errorCode(res: request.Response): string {
  return apiErrorResponseSchema.parse(res.body).error.code;
}

function refreshWith(app: App, token: string) {
  return request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${token}`);
}

async function registerAnna(app: App) {
  const res = await request(app).post('/api/auth/register').send(credentials).expect(201);
  const body = authResponseSchema.parse(res.body);
  const refreshToken = refreshTokenFrom(res);
  if (!refreshToken) throw new Error('register did not set a refresh cookie');
  return { ...body, refreshToken };
}

let app: App;

beforeEach(async () => {
  await resetDatabase();
  // Fresh app per test: rate limiter counters must not leak between tests.
  app = createApp();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/auth/register', () => {
  it('creates the user, returns an access token and sets a locked-down refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: '  Anna@Example.COM ' })
      .expect(201);

    const body = authResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({ email: 'anna@example.com', displayName: 'Anna' });

    const cookie = setCookies(res).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('stores only an Argon2id password hash and a hashed refresh token', async () => {
    const { refreshToken } = await registerAnna(app);

    const [user] = await db.select().from(users);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(credentials.password);

    const [session] = await db.select().from(sessions);
    expect(session?.tokenHash).toBe(hashToken(refreshToken));
  });

  it('rejects a duplicate email regardless of case', async () => {
    await registerAnna(app);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: 'ANNA@example.com' })
      .expect(409);
    expect(errorCode(res)).toBe('EMAIL_TAKEN');
  });

  it('validates the body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', displayName: '' })
      .expect(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and opens a new session', async () => {
    await registerAnna(app);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ANNA@example.com', password: credentials.password })
      .expect(200);

    authResponseSchema.parse(res.body);
    expect(refreshTokenFrom(res)).toBeDefined();
    expect(await db.select().from(sessions)).toHaveLength(2);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await registerAnna(app);
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrong password!' })
      .expect(401);
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong password!' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(errorCode(wrongPassword)).toBe('INVALID_CREDENTIALS');
  });

  it('rate limits repeated failed attempts', async () => {
    const attempt = () =>
      request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'nope' });

    for (let i = 0; i < 10; i++) await attempt().expect(401);
    const res = await attempt().expect(429);
    expect(errorCode(res)).toBe('RATE_LIMITED');
  });
});

describe('GET /api/me', () => {
  it('returns the current user for a valid access token', async () => {
    const { accessToken, user } = await registerAnna(app);
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meResponseSchema.parse(res.body).user).toEqual(user);
  });

  it('rejects missing, tampered and expired tokens', async () => {
    const { accessToken } = await registerAnna(app);

    await request(app).get('/api/me').expect(401);
    await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${accessToken.slice(0, -2)}xx`)
      .expect(401);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and issues a working access token', async () => {
    const { refreshToken } = await registerAnna(app);

    const res = await refreshWith(app, refreshToken).expect(200);
    const rotated = refreshTokenFrom(res);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(refreshToken);

    const { accessToken } = authResponseSchema.parse(res.body);
    await request(app).get('/api/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  it('accepts the previous token within the grace window without setting a new cookie', async () => {
    const { refreshToken } = await registerAnna(app);
    await refreshWith(app, refreshToken).expect(200);

    // A second tab refreshing in parallel with the same (now previous) token.
    const res = await refreshWith(app, refreshToken).expect(200);
    authResponseSchema.parse(res.body);
    expect(refreshTokenFrom(res)).toBeUndefined();
  });

  it('handles truly concurrent refreshes with one rotation (row lock + grace window)', async () => {
    const { refreshToken } = await registerAnna(app);

    const results = await Promise.all([
      refreshWith(app, refreshToken),
      refreshWith(app, refreshToken),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    // Exactly one response rotated the cookie; the other was served from the grace window.
    expect(results.filter((r) => refreshTokenFrom(r) !== undefined)).toHaveLength(1);
  });

  it('revokes the whole session when an old token is reused after the grace window', async () => {
    const { refreshToken } = await registerAnna(app);
    const rotated = refreshTokenFrom(await refreshWith(app, refreshToken).expect(200));
    if (!rotated) throw new Error('expected a rotated token');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + REUSE_GRACE_MS + 1000);

    const reuse = await refreshWith(app, refreshToken).expect(401);
    expect(errorCode(reuse)).toBe('INVALID_REFRESH_TOKEN');

    // The legitimate holder of the newest token is logged out too.
    await refreshWith(app, rotated).expect(401);
    const [session] = await db.select().from(sessions);
    expect(session?.revokedAt).not.toBeNull();
  });

  it('rejects unknown tokens, a missing cookie and expired sessions', async () => {
    const { refreshToken } = await registerAnna(app);

    await refreshWith(app, 'not-a-real-token').expect(401);
    await request(app).post('/api/auth/refresh').expect(401);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await refreshWith(app, refreshToken).expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { refreshToken, user } = await registerAnna(app);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(204);
    expect(setCookies(res).join(';')).toMatch(new RegExp(`${REFRESH_COOKIE}=;`));

    await refreshWith(app, refreshToken).expect(401);
    const [session] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(session?.revokedAt).not.toBeNull();
  });

  it('succeeds without a cookie', async () => {
    await request(app).post('/api/auth/logout').expect(204);
  });
});
