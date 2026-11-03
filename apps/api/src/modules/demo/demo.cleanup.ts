import { asc, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { demos } from '../../db/schema';
import { logger } from '../../lib/logger';
import { startPeriodic, withAdvisoryLock } from '../../lib/periodic';
import { deleteDemo } from './demo.service';

/** Held for the duration of a cleanup run, so two API instances never run one together. */
export const CLEANUP_LOCK = 'splinance:demo-cleanup';
const HOUR_MS = 3_600_000;
/** Sandboxes deleted per run at most; the next run takes the rest. */
const BATCH = 100;

/**
 * Deletes sandboxes whose time is up, each in its own transaction (one that fails does not
 * hold back the rest). Returns how many were deleted; 0 when another instance is running a
 * cleanup right now. A plain function, so a BullMQ job (Phase 6) can call it unchanged.
 */
export async function deleteExpiredDemos(now = new Date()): Promise<number> {
  const deleted = await withAdvisoryLock(CLEANUP_LOCK, async () => {
    const expired = await db
      .select({ id: demos.id })
      .from(demos)
      .where(lte(demos.expiresAt, now))
      .orderBy(asc(demos.expiresAt))
      .limit(BATCH);
    let count = 0;
    for (const { id } of expired) {
      try {
        if (await deleteDemo(id)) count++;
      } catch (err) {
        logger.error({ err, demoId: id }, 'Could not delete an expired demo');
      }
    }
    return count;
  });
  return deleted ?? 0;
}

/** Runs the cleanup now and then every `intervalMs` (an hour), until stopped. */
export function startDemoCleanup(intervalMs = HOUR_MS): () => void {
  return startPeriodic('demo-cleanup', intervalMs, async () => {
    const deleted = await deleteExpiredDemos();
    if (deleted > 0) logger.info({ deleted }, 'Expired demos deleted');
  });
}
