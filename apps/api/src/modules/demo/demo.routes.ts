import type { DemoCreateResponse, DemoStatusResponse } from '@splinance/shared';
import { Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth, requireAuth } from '../../middleware/require-auth';
import { clearRefreshCookie, setRefreshCookie } from '../auth/auth.routes';
import { createDemo, type DemoConfig, endDemo, getDemo } from './demo.service';

/** Mounted only on the demo instance (`DEMO_MODE`); production answers these with 404. */
export function createDemoRouter(config: DemoConfig) {
  const router = Router();

  // Public and expensive (a password hash and a year of data): a few per person, plus the
  // global cap of active sandboxes in the service.
  router.post('/', rateLimiter(5), async (_req, res) => {
    const demo = await createDemo(config);
    if (demo.refreshCookie) setRefreshCookie(res, demo.refreshCookie);
    const body: DemoCreateResponse = {
      accessToken: demo.accessToken,
      user: demo.user,
      householdId: demo.householdId,
      expiresAt: demo.expiresAt.toISOString(),
    };
    res.status(201).json(body);
  });

  router.get('/', requireAuth, async (req, res) => {
    const demo = await getDemo(getAuth(req).userId);
    const body: DemoStatusResponse = { demo: { expiresAt: demo.expiresAt.toISOString() } };
    res.json(body);
  });

  // Deletes the caller's sandbox for good ("Start over", "End demo"); the session goes with it.
  router.delete('/', requireAuth, rateLimiter(20, { perUser: true }), async (req, res) => {
    await endDemo(getAuth(req).userId);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  return router;
}
