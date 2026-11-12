import {
  savingsEntryInputSchema,
  type SavingsEntryListResponse,
  savingsEntryListQuerySchema,
  type SavingsEntryResponse,
  savingsGoalInputSchema,
  type SavingsGoalResponse,
  savingsQuerySchema,
  type SavingsResponse,
  updateSavingsGoalInputSchema,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { householdScope, idParam } from '../households/scope';
import {
  addEntry,
  archiveGoal,
  createGoal,
  deleteEntry,
  entryNotFound,
  getGoal,
  getSavings,
  goalNotFound,
  listEntries,
  updateGoal,
} from './savings.service';

const goalScope = (req: Request) => ({
  ...householdScope(req),
  goalId: idParam(req, 'goalId', goalNotFound),
});

/** Mounted at /households/:id/savings (behind requireAuth). */
export function createSavingsRouter() {
  const router = Router({ mergeParams: true });
  // Per person and 15 minutes.
  const writes = rateLimiter(60, { perUser: true });

  router.get('/', async (req, res) => {
    const scope = householdScope(req);
    const query = savingsQuerySchema.parse(req.query);
    const body: SavingsResponse = { savings: await getSavings(scope, query) };
    res.json(body);
  });

  router.post('/', writes, async (req, res) => {
    const scope = householdScope(req);
    const input = savingsGoalInputSchema.parse(req.body);
    const body: SavingsGoalResponse = { goal: await createGoal(scope, input) };
    res.status(201).json(body);
  });

  router.get('/:goalId', async (req, res) => {
    const body: SavingsGoalResponse = { goal: await getGoal(goalScope(req)) };
    res.json(body);
  });

  router.patch('/:goalId', writes, async (req, res) => {
    const scope = goalScope(req);
    const input = updateSavingsGoalInputSchema.parse(req.body);
    const body: SavingsGoalResponse = { goal: await updateGoal(scope, input) };
    res.json(body);
  });

  router.post('/:goalId/archive', writes, async (req, res) => {
    await archiveGoal(goalScope(req));
    res.status(204).end();
  });

  router.get('/:goalId/entries', async (req, res) => {
    const scope = goalScope(req);
    const query = savingsEntryListQuerySchema.parse(req.query);
    const body: SavingsEntryListResponse = await listEntries(scope, query);
    res.json(body);
  });

  router.post('/:goalId/entries', writes, async (req, res) => {
    const scope = goalScope(req);
    const input = savingsEntryInputSchema.parse(req.body);
    const body: SavingsEntryResponse = await addEntry(scope, input);
    res.status(201).json(body);
  });

  router.delete('/:goalId/entries/:entryId', writes, async (req, res) => {
    const scope = { ...goalScope(req), entryId: idParam(req, 'entryId', entryNotFound) };
    await deleteEntry(scope);
    res.status(204).end();
  });

  return router;
}
