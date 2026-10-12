import type { BalancesResponse } from '@splinance/shared';
import { Router } from 'express';
import { householdScope } from '../households/scope';
import { getBalances } from './balances.service';

/** Mounted at /households/:id/balances (behind requireAuth). */
export function createBalancesRouter() {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const body: BalancesResponse = { balances: await getBalances(householdScope(req)) };
    res.json(body);
  });

  return router;
}
