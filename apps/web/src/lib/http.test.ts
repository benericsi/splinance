import { delay, http as mock, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { server } from '../../test/msw';
import { apiError, authResponse, testUser } from '../../test/utils';
import { authStore } from './auth-store';
import { ApiError, createHttpClient, type HttpClient, noContent } from './http';

const schema = z.object({ value: z.number() });
let client: HttpClient;

beforeEach(() => {
  client = createHttpClient({ baseUrl: `${window.location.origin}/api`, auth: authStore });
});

/** A protected endpoint that only accepts the given access token. */
function protectedThing(validToken: string, calls: { count: number }) {
  return mock.get('/api/thing', ({ request }) => {
    calls.count++;
    return request.headers.get('Authorization') === `Bearer ${validToken}`
      ? HttpResponse.json({ value: 1 })
      : HttpResponse.json(apiError('UNAUTHENTICATED'), { status: 401 });
  });
}

describe('http client', () => {
  it('attaches the access token and parses the body', async () => {
    authStore.setSession('access-1', testUser);
    server.use(protectedThing('access-1', { count: 0 }));

    await expect(client.get('/thing', schema)).resolves.toEqual({ value: 1 });
  });

  it('refreshes once on 401 and retries the request with the new token', async () => {
    authStore.setSession('expired', testUser);
    const refreshes = { count: 0 };
    server.use(
      protectedThing('access-2', { count: 0 }),
      mock.post('/api/auth/refresh', () => {
        refreshes.count++;
        return HttpResponse.json(authResponse('access-2'));
      }),
    );

    await expect(client.get('/thing', schema)).resolves.toEqual({ value: 1 });
    expect(refreshes.count).toBe(1);
    expect(authStore.getState().accessToken).toBe('access-2');
  });

  it('shares a single refresh between concurrent 401s', async () => {
    authStore.setSession('expired', testUser);
    const refreshes = { count: 0 };
    server.use(
      protectedThing('access-2', { count: 0 }),
      mock.post('/api/auth/refresh', async () => {
        refreshes.count++;
        await delay(20);
        return HttpResponse.json(authResponse('access-2'));
      }),
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.get('/thing', schema)),
    );

    expect(results).toHaveLength(5);
    expect(refreshes.count).toBe(1);
  });

  it('logs out and throws the original 401 when the refresh fails', async () => {
    authStore.setSession('expired', testUser);
    server.use(
      protectedThing('never', { count: 0 }),
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
      ),
    );

    await expect(client.get('/thing', schema)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(authStore.getState()).toMatchObject({ status: 'anonymous', accessToken: null });
  });

  it('does not attach tokens or refresh for public requests', async () => {
    authStore.setSession('access-1', testUser);
    let authHeader: string | null = 'unset';
    server.use(
      mock.post('/api/auth/login', ({ request }) => {
        authHeader = request.headers.get('Authorization');
        return HttpResponse.json(apiError('INVALID_CREDENTIALS'), { status: 401 });
      }),
    );

    await expect(
      client.post('/auth/login', schema, { email: 'x' }, { auth: false }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(authHeader).toBeNull();
  });

  it('sends JSON bodies and handles 204 responses', async () => {
    let received: unknown;
    server.use(
      mock.post('/api/things', async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(client.post('/things', noContent, { name: 'x' })).resolves.toBeUndefined();
    expect(received).toEqual({ name: 'x' });
  });

  it('maps non-JSON errors and network failures', async () => {
    server.use(
      mock.get('/api/html', () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })),
      mock.get('/api/down', () => HttpResponse.error()),
    );

    await expect(client.get('/html', schema, { auth: false })).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
    });
    const error: unknown = await client
      .get('/down', schema, { auth: false })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('rejects a 2xx body that does not match the schema', async () => {
    server.use(mock.get('/api/thing', () => HttpResponse.json({ value: 'nope' })));

    await expect(client.get('/thing', schema, { auth: false })).rejects.toBeInstanceOf(z.ZodError);
  });
});
