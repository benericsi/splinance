import type { RequestHandler } from 'express';
import { HttpError } from '../lib/http-error';

/**
 * Closes a route on the demo instance: registering (visitors start with "Try the demo",
 * so the demo database never holds a real person's account) and joining a household (each
 * sandbox stays apart, so deleting one never touches another).
 */
export const closedInDemo: RequestHandler = (_req, _res, next) => {
  next(new HttpError(403, 'This is not available in the demo', 'DEMO_MODE'));
};
