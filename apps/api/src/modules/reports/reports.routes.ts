import { reportQuerySchema, type ReportResponse } from '@splinance/shared';
import { Router } from 'express';
import { householdScope } from '../households/scope';
import { getReport } from './reports.service';

/** Mounted at /households/:id/reports (behind requireAuth). */
export function createReportsRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const scope = householdScope(req);
    const query = reportQuerySchema.parse(req.query);
    const body: ReportResponse = { report: await getReport(scope, query) };
    res.json(body);
  });

  return router;
}
