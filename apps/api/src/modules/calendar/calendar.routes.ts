import { calendarQuerySchema, type CalendarResponse } from '@splinance/shared';
import { Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { householdScope } from '../households/scope';
import { getCalendar } from './calendar.service';

/** Mounted at /households/:id/calendar (behind requireAuth). */
export function createCalendarRouter() {
  const router = Router({ mergeParams: true });
  // Per person and 15 minutes: every month opened matches the last year of transactions
  // against the tracked series again, so paging through months has a ceiling.
  const reads = rateLimiter(240, { perUser: true });

  router.get('/', reads, async (req, res) => {
    const scope = householdScope(req);
    const query = calendarQuerySchema.parse(req.query);
    const body: CalendarResponse = { calendar: await getCalendar(scope, query) };
    res.json(body);
  });

  return router;
}
