import { apiErrorResponseSchema } from '@splinance/shared';
import type { z } from 'zod';

/** A non-2xx response, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Calls the API under /api and validates the JSON body with a shared Zod schema,
 * so callers get typed data or a typed error, never `any`.
 */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  // Headers handles every HeadersInit form (object, array of pairs, Headers instance).
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  // Proxies and crashed servers may answer with HTML or nothing at all.
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorResponseSchema.safeParse(body);
    throw parsed.success
      ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiError(
          res.status,
          'UNKNOWN_ERROR',
          `Request failed with status ${String(res.status)}`,
        );
  }

  return schema.parse(body);
}
