import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { HttpError } from '../lib/http-error';
import { getAuth } from './require-auth';

const MINUTE_MS = 60_000;

const passThrough: RequestHandler = (_req, _res, next) => {
  next();
};

/**
 * Per-IP limit over a 15 minute window, answering with the shared error shape. `perUser`
 * counts per signed-in user instead (behind requireAuth), for work that belongs to a person.
 * Counters live per instance, so create limiters inside router factories (one per app and test).
 * `RATE_LIMIT_DISABLED` (e2e only, refused in production) turns every limiter into a no-op.
 */
export function rateLimiter(
  limit: number,
  { perUser = false, ...options }: { skipSuccessfulRequests?: boolean; perUser?: boolean } = {},
): RequestHandler {
  if (env.RATE_LIMIT_DISABLED) return passThrough;
  return rateLimit({
    windowMs: 15 * MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(perUser && { keyGenerator: (req) => `user:${getAuth(req).userId}` }),
    ...options,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'Too many attempts, please try again later', 'RATE_LIMITED'));
    },
  });
}
