import {
  importCheckInputSchema,
  type ImportCheckResponse,
  importInputSchema,
  type ImportListResponse,
  type ImportResponse,
} from '@splinance/shared';
import express, { Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { householdScope, idParam } from '../households/scope';
import {
  checkImport,
  createImport,
  importNotFound,
  listImports,
  undoImport,
} from './imports.service';
import { syncAfterWrite } from '../notifications/sync';

/** Mounted at /households/:id/imports (behind requireAuth). */
export function createImportsRouter() {
  const router = Router({ mergeParams: true });
  // Checking and importing read up to a thousand rows each: plenty for a person, not a flood.
  const importLimit = rateLimiter(30, { perUser: true });
  // Up to a thousand rows of about 500 bytes. Parsed only here, after requireAuth and the
  // limit (app.ts skips the global parser for these paths); no compressed bodies.
  const importJson = express.json({ limit: '1mb', inflate: false });

  router.get('/', async (req, res) => {
    const body: ImportListResponse = { batches: await listImports(householdScope(req)) };
    res.json(body);
  });

  // A read that needs a body (up to a thousand rows), so a POST that changes nothing.
  router.post('/check', importLimit, importJson, async (req, res) => {
    const scope = householdScope(req);
    const input = importCheckInputSchema.parse(req.body);
    const body: ImportCheckResponse = { rows: await checkImport(scope, input) };
    res.json(body);
  });

  router.post('/', importLimit, importJson, async (req, res) => {
    const scope = householdScope(req);
    const input = importInputSchema.parse(req.body);
    const body: ImportResponse = await createImport(scope, input);
    await syncAfterWrite(scope.householdId);
    res.status(201).json(body);
  });

  router.delete('/:importId', async (req, res) => {
    const scope = householdScope(req);
    await undoImport({ ...scope, importId: idParam(req, 'importId', importNotFound) });
    await syncAfterWrite(scope.householdId);
    res.status(204).end();
  });

  return router;
}
