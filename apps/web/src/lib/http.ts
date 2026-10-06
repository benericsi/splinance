import { apiErrorResponseSchema, authResponseSchema } from '@splinance/shared';
import { z } from 'zod';
import { type AuthStore, authStore } from './auth-store';

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

/** Schema for endpoints that answer 204 No Content. */
export const noContent = z.unknown().transform((): void => undefined);

export interface RequestOptions {
  signal?: AbortSignal | undefined;
  /** Attach the access token and refresh on 401. Default true. */
  auth?: boolean;
}

export interface HttpClientConfig {
  /** Absolute API base, e.g. `${origin}/api`. */
  baseUrl: string;
  auth: AuthStore;
}

export interface HttpClient {
  get<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T>;
  post<T>(path: string, schema: z.ZodType<T>, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, schema: z.ZodType<T>, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  delete<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T>;
  /**
   * Exchanges the refresh cookie for a new access token. Concurrent callers share one
   * request, and tabs take turns via the Web Locks API. Resolves false if logged out.
   */
  refreshSession(): Promise<boolean>;
}

const REFRESH_LOCK = 'splinance:refresh-session';

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  // Serializes refreshes across tabs: the next tab then sends the already-rotated cookie.
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request(REFRESH_LOCK, fn);
  }
  return fn();
}

async function readJson(res: Response): Promise<unknown> {
  // Proxies and crashed servers may answer with HTML or nothing at all.
  return res.json().catch(() => null);
}

async function toApiError(res: Response): Promise<ApiError> {
  const parsed = apiErrorResponseSchema.safeParse(await readJson(res));
  return parsed.success
    ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
    : new ApiError(res.status, 'UNKNOWN_ERROR', `Request failed with status ${String(res.status)}`);
}

export function createHttpClient({ baseUrl, auth }: HttpClientConfig): HttpClient {
  let refreshing: Promise<boolean> | null = null;

  async function send(method: string, path: string, body: unknown, options: RequestOptions) {
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const token = auth.getState().accessToken;
    if (options.auth !== false && token) headers.set('Authorization', `Bearer ${token}`);

    try {
      return await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        signal: options.signal ?? null,
        credentials: 'same-origin',
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
    }
  }

  async function doRefresh(): Promise<boolean> {
    const res = await send('POST', '/auth/refresh', undefined, { auth: false });
    if (!res.ok) {
      auth.clear();
      return false;
    }
    const { accessToken, user } = authResponseSchema.parse(await readJson(res));
    auth.setSession(accessToken, user);
    return true;
  }

  function refreshSession(): Promise<boolean> {
    refreshing ??= withCrossTabLock(doRefresh)
      .catch(() => {
        auth.clear();
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    let res = await send(method, path, body, options);

    // Expired access token: refresh once (shared by all waiting requests) and retry once.
    if (res.status === 401 && options.auth !== false && (await refreshSession())) {
      res = await send(method, path, body, options);
    }

    if (!res.ok) throw await toApiError(res);
    return schema.parse(res.status === 204 ? undefined : await readJson(res));
  }

  return {
    get: (path, schema, options) => request('GET', path, schema, undefined, options),
    post: (path, schema, body, options) => request('POST', path, schema, body, options),
    put: (path, schema, body, options) => request('PUT', path, schema, body, options),
    patch: (path, schema, body, options) => request('PATCH', path, schema, body, options),
    delete: (path, schema, options) => request('DELETE', path, schema, undefined, options),
    refreshSession,
  };
}

/** The app's client. Only feature `api.ts` files should import it. */
export const http = createHttpClient({
  baseUrl: `${window.location.origin}/api`,
  auth: authStore,
});
