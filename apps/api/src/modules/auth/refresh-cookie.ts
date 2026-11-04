import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import type { RefreshCookie } from './auth.service';

export const REFRESH_COOKIE = 'refresh_token';

// Scoped to /api/auth so the token is never sent with ordinary API requests.
// SameSite=Strict blocks cross-site requests from carrying it (CSRF on /refresh). A response
// to a top-level navigation may still set it, even one that came from another site: that is
// how a provider sign-in's callback (reached from Google) starts the session.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/api/auth',
};

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function setRefreshCookie(res: Response, cookie: RefreshCookie) {
  res.cookie(REFRESH_COOKIE, cookie.token, { ...cookieOptions, expires: cookie.expiresAt });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}
