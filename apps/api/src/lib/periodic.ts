import { pool } from '../db/client';
import { logger } from './logger';

/**
 * Runs `fn` while holding a session-level Postgres advisory lock named `name`, so two API
 * instances never run the same job at once. Returns null without running when another
 * instance holds the lock. The lock lives on one connection: taken and released on the same.
 */
export async function withAdvisoryLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as locked',
      [name],
    );
    if (!rows[0]?.locked) return null;
    try {
      return await fn();
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [name]);
    }
  } finally {
    client.release();
  }
}

/**
 * Runs `run` now and then every `intervalMs` in this process, until the returned function
 * stops it. Runs never overlap; a failed run is logged as `job` and retried on the next tick
 * (the database may not be up yet when the API starts). The timer never keeps Node alive.
 */
export function startPeriodic(job: string, intervalMs: number, run: () => Promise<void>) {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    run()
      .catch((err: unknown) => {
        logger.error({ err, job }, 'Scheduled job failed');
      })
      .finally(() => {
        running = false;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
