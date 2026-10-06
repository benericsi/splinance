import type { HealthResponse } from '@splinance/shared';
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = { status: 'ok', uptimeSeconds: process.uptime() };
  res.json(body);
});
