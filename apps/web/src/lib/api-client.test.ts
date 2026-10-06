import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { jsonResponse, stubFetch } from '../../test/utils';
import { ApiError, apiFetch } from './api-client';

const schema = z.object({ value: z.number() });

describe('apiFetch', () => {
  it('prefixes /api and returns parsed data', async () => {
    const fetchMock = stubFetch({ '/api/thing': () => jsonResponse({ value: 1 }) });

    await expect(apiFetch('/thing', schema)).resolves.toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/thing', expect.anything());
  });

  it('keeps caller headers in any HeadersInit form and adds Accept', async () => {
    const fetchMock = stubFetch({ '/api/thing': () => jsonResponse({ value: 1 }) });

    await apiFetch('/thing', schema, { headers: new Headers({ 'X-Test': 'a' }) });
    await apiFetch('/thing', schema, { headers: [['X-Test', 'b']] });

    const sent = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(sent.map((h) => h.get('X-Test'))).toEqual(['a', 'b']);
    expect(sent.every((h) => h.get('Accept') === 'application/json')).toBe(true);
  });

  it('throws ApiError with code and message from an API error body', async () => {
    stubFetch({
      '/api/thing': () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Nope' } }, 404),
    });

    await expect(apiFetch('/thing', schema)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Nope',
    });
  });

  it('handles non-JSON error responses', async () => {
    stubFetch({ '/api/thing': () => new Response('<html>Bad gateway</html>', { status: 502 }) });

    await expect(apiFetch('/thing', schema)).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
    });
  });

  it('maps network failures to status 0', async () => {
    stubFetch({});

    const error: unknown = await apiFetch('/thing', schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('rejects a 2xx body that does not match the schema', async () => {
    stubFetch({ '/api/thing': () => jsonResponse({ value: 'not a number' }) });

    await expect(apiFetch('/thing', schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
