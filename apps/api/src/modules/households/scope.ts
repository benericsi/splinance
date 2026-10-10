import type { Request } from 'express';
import { z } from 'zod';
import type { HttpError } from '../../lib/http-error';
import { getAuth } from '../../middleware/require-auth';
import { householdNotFound } from './households.service';

const uuidSchema = z.uuid();

/** A malformed id cannot exist, so it gets the same 404 as an unknown one (never a 400 or 500). */
export function idParam(req: Request, name: string, notFound: () => HttpError): string {
  const result = uuidSchema.safeParse(req.params[name]);
  if (!result.success) throw notFound();
  return result.data;
}

/** The current user and the household from `/households/:id/...`. */
export function householdScope(req: Request) {
  return { userId: getAuth(req).userId, householdId: idParam(req, 'id', householdNotFound) };
}
