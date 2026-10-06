import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error';
import { type AccessTokenClaims, verifyAccessToken } from '../modules/auth/tokens';

const unauthenticated = (message: string) => new HttpError(401, message, 'UNAUTHENTICATED');

/**
 * Verifies the Bearer access token. Stateless by design: a revoked session's access
 * token stays valid until it expires (at most ACCESS_TOKEN_TTL_SECONDS).
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) throw unauthenticated('Authentication required');

  try {
    req.auth = await verifyAccessToken(token);
  } catch {
    throw unauthenticated('Invalid or expired access token');
  }
  next();
};

/** For handlers behind requireAuth. Throws if the middleware was not applied. */
export function getAuth(req: Request): AccessTokenClaims {
  if (!req.auth) throw new Error('getAuth called on a route without requireAuth');
  return req.auth;
}
