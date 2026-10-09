import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../lib/http-error';

const MINUTE_MS = 60_000;

/**
 * Per-IP limit over a 15 minute window, answering with the shared error shape.
 * Counters live per instance, so create limiters inside router factories (one per app and test).
 */
export function rateLimiter(limit: number, options: { skipSuccessfulRequests?: boolean } = {}) {
  return rateLimit({
    windowMs: 15 * MINUTE_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...options,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'Too many attempts, please try again later', 'RATE_LIMITED'));
    },
  });
}
