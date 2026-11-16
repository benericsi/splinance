import type { LiveResponse, ReadyResponse } from '@splinance/shared';
import { Router } from 'express';

export interface HealthDeps {
  pingDatabase: () => Promise<void>;
  /** The clock for the readiness cache (tests move it). */
  now?: () => number;
}

/** How long one readiness answer is reused: the check stays cheap however often it is hit. */
const READY_CACHE_MS = 5_000;

export function createHealthRouter({ pingDatabase, now = Date.now }: HealthDeps) {
  const router = Router();
  // The latest check (in flight or done) and when it started; callers in that window share it.
  let cached: { at: number; result: Promise<unknown> } | null = null;

  router.get('/live', (_req, res) => {
    const body: LiveResponse = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(body);
  });

  // Public and unlimited (the platform's healthcheck calls it), so the database is asked at
  // most once per READY_CACHE_MS, not once per request.
  router.get('/ready', async (req, res) => {
    if (!cached || now() - cached.at >= READY_CACHE_MS) {
      cached = {
        at: now(),
        result: pingDatabase().then(
          () => null,
          (err: unknown) => err ?? 'error',
        ),
      };
    }
    const failure = await cached.result;
    let database: ReadyResponse['checks']['database'] = 'ok';
    if (failure !== null) {
      req.log.warn({ err: failure }, 'Readiness check failed: database');
      database = 'error';
    }

    const body: ReadyResponse = { status: database, checks: { database } };
    res.status(database === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
