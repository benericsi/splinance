import {
  settlementInputSchema,
  type SettlementListResponse,
  settlementListQuerySchema,
  type SettlementResponse,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { householdScope, idParam } from '../households/scope';
import {
  createSettlement,
  deleteSettlement,
  listSettlements,
  restoreSettlement,
  settlementNotFound,
} from './settlements.service';

function settlementScope(req: Request) {
  return {
    ...householdScope(req),
    settlementId: idParam(req, 'settlementId', settlementNotFound),
  };
}

/** Mounted at /households/:id/settlements (behind requireAuth). */
export function createSettlementsRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const scope = householdScope(req);
    const query = settlementListQuerySchema.parse(req.query);
    const body: SettlementListResponse = await listSettlements(scope, query);
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const scope = householdScope(req);
    const input = settlementInputSchema.parse(req.body);
    const body: SettlementResponse = { settlement: await createSettlement(scope, input) };
    res.status(201).json(body);
  });

  router.delete('/:settlementId', async (req, res) => {
    await deleteSettlement(settlementScope(req));
    res.status(204).end();
  });

  router.post('/:settlementId/restore', async (req, res) => {
    const body: SettlementResponse = {
      settlement: await restoreSettlement(settlementScope(req)),
    };
    res.json(body);
  });

  return router;
}
