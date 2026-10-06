import { liveResponseSchema, readyResponseSchema } from '@splinance/shared';
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
