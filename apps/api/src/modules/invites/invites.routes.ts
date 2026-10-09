import {
  type HouseholdResponse,
  inviteTokenSchema,
  type InvitePreviewResponse,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth, requireAuth } from '../../middleware/require-auth';
import { acceptInvite, inviteNotFound, previewInvite } from './invites.service';

function tokenParam(req: Request): string {
  const result = inviteTokenSchema.safeParse(req.params.token);
  if (!result.success) throw inviteNotFound();
  return result.data;
}

/**
 * Token-addressed routes: /api/invites/:token. The token is a credential, so request logs
 * redact it (see redactUrl). Household-scoped invite routes live in the households router.
 */
export function createInvitesRouter() {
  const router = Router();

  // Public, so the invite page can show what the link is for before login or registration.
  router.get('/:token', rateLimiter(60), async (req, res) => {
    const body: InvitePreviewResponse = { invite: await previewInvite(tokenParam(req)) };
    res.json(body);
  });

  router.post('/:token/accept', rateLimiter(30), requireAuth, async (req, res) => {
    const household = await acceptInvite({ userId: getAuth(req).userId, token: tokenParam(req) });
    const body: HouseholdResponse = { household };
    res.json(body);
  });

  return router;
}
