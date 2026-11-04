import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';
import { HttpError } from '../../lib/http-error';

/**
 * For writes that create something new for the caller (a household, a membership): a
 * deleted account's access token stays valid for up to 15 minutes, and must not be able
 * to start new data under the anonymized row.
 */
export async function assertLiveUser(executor: Db, userId: string): Promise<void> {
  const [user] = await executor
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.deletedAt) {
    throw new HttpError(401, 'Your session has ended, please log in again', 'UNAUTHENTICATED');
  }
}
