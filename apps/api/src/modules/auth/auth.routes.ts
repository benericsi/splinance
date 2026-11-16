import { createHash } from 'node:crypto';
import {
  type AuthProvidersResponse,
  type AuthResponse,
  loginInputSchema,
  type MeResponse,
  registerInputSchema,
} from '@splinance/shared';
import { type Request, type RequestHandler, type Response, Router } from 'express';
import { HttpError } from '../../lib/http-error';
import { closedInDemo } from '../../middleware/demo-mode';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth } from '../../middleware/require-auth';
import {
  type AuthResult,
  getUser,
  login,
  logout,
  type RegistrationPolicy,
  refresh,
  register,
} from './auth.service';
import { clearOAuthCookie, hasOAuthCookie, readOAuthCookie } from './oauth/cookies';
import { createOAuthRouter, type OAuthDeps } from './oauth/oauth.routes';
import {
  clearRefreshCookie,
  REFRESH_COOKIE,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

export { REFRESH_COOKIE };

function sendAuth(res: Response, status: number, result: AuthResult) {
  if (result.refreshCookie) setRefreshCookie(res, result.refreshCookie);
  const body: AuthResponse = {
    accessToken: result.accessToken,
    user: result.user,
    ...(result.linkedProvider && { linkedProvider: result.linkedProvider }),
  };
  res.status(status).json(body);
}

/** Rate limiters live per router instance, so each app (and test) gets its own counters. */
/**
 * Failed logins per account: the email as the login schema normalizes it, hashed, so the
 * limiter's store holds no addresses. A body without one shares a single key.
 */
function loginAccountKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return `login-account:${createHash('sha256').update(normalized).digest('base64url')}`;
}

export function createAuthRouter({
  demo = false,
  registration = { mode: 'open', allowlist: [] },
  oauth = null,
}: {
  demo?: boolean;
  registration?: RegistrationPolicy;
  /** Sign-in providers; never on the demo instance (its database holds only sandboxes). */
  oauth?: OAuthDeps | null;
} = {}) {
  const router = Router();
  const providers = demo ? [] : (oauth?.providers ?? []);

  const loginPerIp = rateLimiter(10, { skipSuccessfulRequests: true });
  const loginPerAccount = rateLimiter(10, { skipSuccessfulRequests: true, key: loginAccountKey });

  if (demo) router.post('/register', closedInDemo);
  router.post('/register', rateLimiter(5), async (req, res) => {
    const input = registerInputSchema.parse(req.body);
    sendAuth(res, 201, await register(input, registration));
  });

  // Only failed attempts count, so normal users never hit the limit: 10 per IP, and 10 per
  // account so one account cannot be guessed from many addresses (the same for known and
  // unknown emails). A waiting provider account (link cookie) is connected by the same
  // successful login.
  router.post('/login', loginPerIp, loginPerAccount, async (req, res) => {
    const input = loginInputSchema.parse(req.body);
    const pendingLink = providers.length > 0 ? await readOAuthCookie(req, 'link') : undefined;
    const result = await login(input, pendingLink);
    if (hasOAuthCookie(req, 'link')) clearOAuthCookie(res, 'link');
    sendAuth(res, 200, result);
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
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.get('/providers', (_req, res) => {
    const body: AuthProvidersResponse = { providers: providers.map((p) => ({ id: p.config.id })) };
    res.json(body);
  });

  if (oauth && providers.length > 0) {
    router.use('/oauth', createOAuthRouter({ oauth, registration }));
  }

  return router;
}

export const getMe: RequestHandler = async (req, res) => {
  const body: MeResponse = { user: await getUser(getAuth(req).userId) };
  res.json(body);
};
