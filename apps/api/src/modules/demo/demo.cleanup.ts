import { asc, lte } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { demos } from '../../db/schema';
import { logger } from '../../lib/logger';
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
  // A session-level advisory lock lives on one connection: take and release it on the same one.
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as locked',
      [CLEANUP_LOCK],
    );
    if (!rows[0]?.locked) return 0;
    try {
      const expired = await db
        .select({ id: demos.id })
        .from(demos)
        .where(lte(demos.expiresAt, now))
        .orderBy(asc(demos.expiresAt))
        .limit(BATCH);
      let deleted = 0;
      for (const { id } of expired) {
        try {
          if (await deleteDemo(id)) deleted++;
        } catch (err) {
          logger.error({ err, demoId: id }, 'Could not delete an expired demo');
        }
      }
      return deleted;
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [CLEANUP_LOCK]);
    }
  } finally {
    client.release();
  }
}

/**
 * Runs the cleanup now and then every `intervalMs` (an hour) in this process, until the
 * returned function stops it. Runs never overlap; a failed run is logged and retried on the
 * next tick (the database may not be up yet when the API starts).
 */
export function startDemoCleanup(intervalMs = HOUR_MS): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    deleteExpiredDemos()
      .then((deleted) => {
        if (deleted > 0) logger.info({ deleted }, 'Expired demos deleted');
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Demo cleanup failed');
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
