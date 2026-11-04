import {
  recurringPreviewInputSchema,
  type RecurringListResponse,
  type RecurringPreviewResponse,
  recurringSeriesInputSchema,
  type RecurringSeriesResponse,
  recurringSuggestionDecisionSchema,
  updateRecurringSeriesInputSchema,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { householdScope, idParam } from '../households/scope';
import {
  confirmSuggestion,
  createSeries,
  deleteSeries,
  dismissSuggestion,
  listRecurring,
  previewSeries,
  seriesNotFound,
  updateSeries,
} from './recurring.service';

const seriesScope = (req: Request) => ({
  ...householdScope(req),
  seriesId: idParam(req, 'seriesId', seriesNotFound),
});

/** Mounted at /households/:id/recurring (behind requireAuth). */
export function createRecurringRouter() {
  const router = Router({ mergeParams: true });
  // Per person and 15 minutes: changes, and the preview that runs while typing a pattern.
  const writes = rateLimiter(30, { perUser: true });
  const previews = rateLimiter(60, { perUser: true });

  router.get('/', async (req, res) => {
    const body: RecurringListResponse = { recurring: await listRecurring(householdScope(req)) };
    res.json(body);
  });

  router.post('/', writes, async (req, res) => {
    const scope = householdScope(req);
    const input = recurringSeriesInputSchema.parse(req.body);
    const body: RecurringSeriesResponse = { series: await createSeries(scope, input) };
    res.status(201).json(body);
  });

  // A read with a body (like imports/check), so a POST.
  router.post('/preview', previews, async (req, res) => {
    const scope = householdScope(req);
    const input = recurringPreviewInputSchema.parse(req.body);
    const body: RecurringPreviewResponse = await previewSeries(scope, input);
    res.json(body);
  });

  router.post('/suggestions/confirm', writes, async (req, res) => {
    const scope = householdScope(req);
    const decision = recurringSuggestionDecisionSchema.parse(req.body);
    const body: RecurringSeriesResponse = { series: await confirmSuggestion(scope, decision) };
    res.status(201).json(body);
  });

  router.post('/suggestions/dismiss', writes, async (req, res) => {
    const scope = householdScope(req);
    const decision = recurringSuggestionDecisionSchema.parse(req.body);
    await dismissSuggestion(scope, decision);
    res.status(204).end();
  });

  router.patch('/:seriesId', writes, async (req, res) => {
    const scope = seriesScope(req);
    const input = updateRecurringSeriesInputSchema.parse(req.body);
    const body: RecurringSeriesResponse = { series: await updateSeries(scope, input) };
    res.json(body);
  });

  router.delete('/:seriesId', writes, async (req, res) => {
    await deleteSeries(seriesScope(req));
    res.status(204).end();
  });

  return router;
}
