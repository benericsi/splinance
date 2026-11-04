import { z } from 'zod';

/**
 * Why a provider sign-in ended back on /login (`?oauth_error=`). Only codes, never personal
 * data: the URL reaches the server and the browser history.
 */
export const OAUTH_ERROR_CODES = [
  'cancelled',
  'not_allowed',
  'email_unverified',
  'expired',
  'conflict',
  'unavailable',
  'failed',
] as const;

export const oauthErrorCodeSchema = z.enum(OAUTH_ERROR_CODES);

export type OAuthErrorCode = z.infer<typeof oauthErrorCodeSchema>;

/** Provider ids double as URL segments and `user_identities.provider` (same format check). */
export const oauthProviderIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);

/** GET /api/auth/providers: the sign-in providers configured on this instance. */
export const authProvidersResponseSchema = z.object({
  providers: z.array(z.object({ id: oauthProviderIdSchema })).max(10),
});

export type AuthProvidersResponse = z.infer<typeof authProvidersResponseSchema>;

/**
 * GET /api/auth/oauth/link: a provider account waiting to be connected to the password
 * account with this email (the login page prefills it).
 */
export const oauthPendingLinkResponseSchema = z.object({
  provider: oauthProviderIdSchema,
  email: z.email(),
});

export type OAuthPendingLinkResponse = z.infer<typeof oauthPendingLinkResponseSchema>;

const DEFAULT_REDIRECT = '/';

/**
 * Only same-app paths are allowed as a destination after signing in. Rejects absolute URLs,
 * protocol-relative tricks (`//evil.com`, `/\evil.com`) and control characters, which URL
 * parsing drops (`/<tab>/evil.com` becomes `//evil.com`). What is left is resolved the way a
 * browser would against `origin` and must stay on it, to prevent open redirects.
 */
export function safeRedirectPath(target: string | undefined, origin: string): string {
  if (!target?.startsWith('/') || target.startsWith('//') || target.length > 2048) {
    return DEFAULT_REDIRECT;
  }
  for (let i = 0; i < target.length; i++) {
    const code = target.charCodeAt(i);
    // Control characters and space, DEL, backslash.
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return DEFAULT_REDIRECT;
  }
  const url = new URL(target, origin);
  if (url.origin !== new URL(origin).origin) return DEFAULT_REDIRECT;
  return `${url.pathname}${url.search}${url.hash}`;
}
