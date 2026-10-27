import {
  importCheckInputSchema,
  type ImportCheckResponse,
  importInputSchema,
  type ImportListResponse,
  type ImportResponse,
} from '@splinance/shared';
import { Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { householdScope, idParam } from '../households/scope';
import {
  checkImport,
  createImport,
  importNotFound,
  listImports,
  undoImport,
} from './imports.service';

/** Mounted at /households/:id/imports (behind requireAuth). */
export function createImportsRouter() {
  const router = Router({ mergeParams: true });
  // Checking and importing read up to a thousand rows each: plenty for a person, not a flood.
  const importLimit = rateLimiter(30, { perUser: true });

  router.get('/', async (req, res) => {
    const body: ImportListResponse = { batches: await listImports(householdScope(req)) };
    res.json(body);
  });

  // A read that needs a body (up to a thousand rows), so a POST that changes nothing.
  router.post('/check', importLimit, async (req, res) => {
    const scope = householdScope(req);
    const input = importCheckInputSchema.parse(req.body);
    const body: ImportCheckResponse = { rows: await checkImport(scope, input) };
    res.json(body);
  });

  router.post('/', importLimit, async (req, res) => {
    const scope = householdScope(req);
    const input = importInputSchema.parse(req.body);
    const body: ImportResponse = await createImport(scope, input);
    res.status(201).json(body);
  });

  router.delete('/:importId', async (req, res) => {
    const scope = householdScope(req);
    await undoImport({ ...scope, importId: idParam(req, 'importId', importNotFound) });
    res.status(204).end();
  });

  return router;
}
