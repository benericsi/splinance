import type { LiveResponse, ReadyResponse } from '@splinance/shared';
import { Router } from 'express';

export interface HealthDeps {
  pingDatabase: () => Promise<void>;
}

export function createHealthRouter({ pingDatabase }: HealthDeps) {
  const router = Router();

  router.get('/live', (_req, res) => {
    const body: LiveResponse = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(body);
  });

  router.get('/ready', async (req, res) => {
    let database: ReadyResponse['checks']['database'] = 'ok';
    try {
      await pingDatabase();
    } catch (err) {
      req.log.warn({ err }, 'Readiness check failed: database');
      database = 'error';
    }

    const body: ReadyResponse = { status: database, checks: { database } };
    res.status(database === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
