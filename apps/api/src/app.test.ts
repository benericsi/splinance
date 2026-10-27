import { apiErrorResponseSchema, liveResponseSchema, readyResponseSchema } from '@splinance/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

// Uses the real test database (see test/test-db.ts).
const app = createApp();

describe('GET /api/health/live', () => {
  it('returns ok with a valid shared-schema body', async () => {
    const res = await request(app).get('/api/health/live').expect(200);
    expect(liveResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GET /api/health/ready', () => {
  it('returns 200 when the database is reachable', async () => {
    const res = await request(app).get('/api/health/ready').expect(200);
    expect(readyResponseSchema.parse(res.body)).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const brokenApp = createApp({
      pingDatabase: () => Promise.reject(new Error('connection refused')),
    });
    const res = await request(brokenApp).get('/api/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'error', checks: { database: 'error' } });
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/nope not found' },
    });
  });
});

describe('request bodies', () => {
  const login = () => request(app).post('/api/auth/login').set('content-type', 'application/json');

  it('answers malformed JSON with 400, not a server error', async () => {
    const res = await login().send('{bad').expect(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
  });

  it('answers a body over the limit with 413', async () => {
    const res = await login()
      .send(JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }))
      .expect(413);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('refuses compressed bodies with 415', async () => {
    const res = await login()
      .set('content-encoding', 'gzip')
      .send(Buffer.from([0x1f, 0x8b, 0x08, 0x00]))
      .expect(415);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
