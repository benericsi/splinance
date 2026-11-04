import {
  type AccountResponse,
  changePasswordInputSchema,
  type ProfileResponse,
  type RevokeSessionsResponse,
  updateProfileInputSchema,
} from '@splinance/shared';
import { Router } from 'express';
import { closedInDemo } from '../../middleware/demo-mode';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth, requireAuth } from '../../middleware/require-auth';
import { changePassword, getAccount, revokeOtherSessions, updateProfile } from './account.service';

/**
 * The signed-in user's own account, mounted at /api/account. Security log lines carry the
 * event and the user id only (never an email, a name or a password).
 *
 * On the demo every write is closed: the demo story's people keep their names (the data
 * track shows demo display names, so a typed one would be free text from outside the
 * story), and demo accounts have no usable password.
 */
export function createAccountRouter({
  demo = false,
  providerIds = [],
}: {
  demo?: boolean;
  /** Sign-in providers configured on this instance (none on the demo). */
  providerIds?: readonly string[];
} = {}) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const body: AccountResponse = await getAccount(getAuth(req).userId, providerIds);
    res.set('Cache-Control', 'no-store').json(body);
  });

  if (demo) {
    router.patch('/', closedInDemo);
    router.post('/password', closedInDemo);
    router.post('/sessions/revoke-others', closedInDemo);
  }

  router.patch('/', rateLimiter(30, { perUser: true }), async (req, res) => {
    const input = updateProfileInputSchema.parse(req.body);
    const body: ProfileResponse = { user: await updateProfile(getAuth(req).userId, input) };
    res.json(body);
  });

  // Failed attempts only: a stolen access token must not be able to guess the password.
  router.post(
    '/password',
    rateLimiter(10, { perUser: true, skipSuccessfulRequests: true }),
    async (req, res) => {
      const input = changePasswordInputSchema.parse(req.body);
      const auth = getAuth(req);
      const { firstPassword, revoked } = await changePassword(auth, input);
      req.log.info(
        {
          event: firstPassword ? 'account.password_set' : 'account.password_changed',
          userId: auth.userId,
          revokedSessions: revoked,
        },
        firstPassword ? 'Password set' : 'Password changed',
      );
      res.status(204).end();
    },
  );

  router.post('/sessions/revoke-others', rateLimiter(10, { perUser: true }), async (req, res) => {
    const auth = getAuth(req);
    const revoked = await revokeOtherSessions(auth);
    req.log.info(
      { event: 'account.sessions_revoked', userId: auth.userId, revokedSessions: revoked },
      'Other sessions signed out',
    );
    const body: RevokeSessionsResponse = { revoked };
    res.json(body);
  });

  return router;
}
