import {
  type AuthResponse,
  loginInputSchema,
  type MeResponse,
  registerInputSchema,
} from '@splinance/shared';
import {
  type CookieOptions,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from 'express';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { closedInDemo } from '../../middleware/demo-mode';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth } from '../../middleware/require-auth';
import {
  type AuthResult,
  getUser,
  login,
  logout,
  type RefreshCookie,
  refresh,
  register,
} from './auth.service';

export const REFRESH_COOKIE = 'refresh_token';

// Scoped to /api/auth so the token is never sent with ordinary API requests.
// SameSite=Strict blocks cross-site requests from carrying it (CSRF on /refresh).
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/api/auth',
};

function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function setRefreshCookie(res: Response, cookie: RefreshCookie) {
  res.cookie(REFRESH_COOKIE, cookie.token, { ...cookieOptions, expires: cookie.expiresAt });
}

function sendAuth(res: Response, status: number, result: AuthResult) {
  if (result.refreshCookie) setRefreshCookie(res, result.refreshCookie);
  const body: AuthResponse = { accessToken: result.accessToken, user: result.user };
  res.status(status).json(body);
}

/** Rate limiters live per router instance, so each app (and test) gets its own counters. */
export function createAuthRouter({ demo = false }: { demo?: boolean } = {}) {
  const router = Router();

  if (demo) router.post('/register', closedInDemo);
  router.post('/register', rateLimiter(5), async (req, res) => {
    const input = registerInputSchema.parse(req.body);
    sendAuth(res, 201, await register(input));
  });

  // Only failed attempts count, so normal users never hit the limit.
  router.post('/login', rateLimiter(10, { skipSuccessfulRequests: true }), async (req, res) => {
    const input = loginInputSchema.parse(req.body);
    sendAuth(res, 200, await login(input));
  });

  router.post('/refresh', rateLimiter(100), async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) {
      throw new HttpError(401, 'Session expired, please log in again', 'INVALID_REFRESH_TOKEN');
    }
    sendAuth(res, 200, await refresh(token));
  });

  router.post('/logout', async (req, res) => {
    await logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).end();
  });

  return router;
}

export const getMe: RequestHandler = async (req, res) => {
  const body: MeResponse = { user: await getUser(getAuth(req).userId) };
  res.json(body);
};
