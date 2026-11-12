import {
  type AccountResponse,
  type AccountDeletionPreview,
  changePasswordInputSchema,
  deleteAccountInputSchema,
  oauthProviderIdSchema,
  type ProfileResponse,
  type ProviderRedirectResponse,
  reauthInputSchema,
  type RevokeSessionsResponse,
  safeRedirectPath,
  stepUpInputSchema,
  updatePreferencesInputSchema,
  updateProfileInputSchema,
} from '@splinance/shared';
import { type Request, type Response, Router } from 'express';
import { HttpError } from '../../lib/http-error';
import { closedInDemo } from '../../middleware/demo-mode';
import { rateLimiter } from '../../middleware/rate-limit';
import { getAuth, requireAuth } from '../../middleware/require-auth';
import { beginFlow } from '../auth/oauth/flow';
import type { OAuthDeps } from '../auth/oauth/oauth.routes';
import type { OAuthProvider } from '../auth/oauth/providers';
import { clearRefreshCookie } from '../auth/refresh-cookie';
import {
  changePassword,
  disconnectIdentity,
  getAccount,
  prepareConnect,
  prepareReauth,
  revokeOtherSessions,
  updatePreferences,
  updateProfile,
} from './account.service';
import { deleteAccount, previewDeletion } from './deletion.service';

/**
 * The signed-in user's own account, mounted at /api/account. Security log lines carry the
 * event and the user id only (never an email, a name or a password).
 *
 * On the demo every write is closed: the demo story's people keep their names (the data
 * track shows demo display names, so a typed one would be free text from outside the
 * story), and demo accounts have no usable password. Preferences are the exception: fixed
 * values, nothing about signing in, and part of what a visitor can try.
 */
export function createAccountRouter({
  demo = false,
  oauth = null,
}: {
  demo?: boolean;
  /** Sign-in providers (connect, disconnect, re-authenticate); never on the demo. */
  oauth?: OAuthDeps | null;
} = {}) {
  const router = Router();
  router.use(requireAuth);
  const configured = demo ? [] : (oauth?.providers ?? []);
  const providers = new Map(configured.map((p) => [p.config.id, p]));

  function providerFor(req: Request): OAuthProvider {
    const provider = providers.get(String(req.params.provider));
    if (!provider) throw new HttpError(404, 'Unknown sign-in provider', 'NOT_FOUND');
    return provider;
  }

  /** The provider's authorization URL, with the flow cookie that remembers who asked. */
  async function sendProviderRedirect(
    req: Request,
    res: Response,
    provider: OAuthProvider,
    intent: 'connect' | 'reauth',
    redirect: string | undefined,
  ) {
    const { userId, sessionId } = getAuth(req);
    let url: URL;
    try {
      url = await beginFlow(res, {
        appOrigin: oauth?.appOrigin ?? '',
        provider,
        redirect,
        intent,
        userId,
        sessionId,
      });
    } catch {
      req.log.warn(
        { provider: provider.config.id, reason: 'discovery failed' },
        'Provider unavailable',
      );
      throw new HttpError(
        503,
        'That sign-in provider is not available right now',
        'PROVIDER_UNAVAILABLE',
      );
    }
    const body: ProviderRedirectResponse = { authorizationUrl: url.href };
    res.set('Cache-Control', 'no-store').json(body);
  }

  router.get('/', async (req, res) => {
    const body: AccountResponse = await getAccount(
      getAuth(req),
      configured.map((p) => p.config.id),
    );
    res.set('Cache-Control', 'no-store').json(body);
  });

  if (demo) {
    router.patch('/', closedInDemo);
    router.post('/password', closedInDemo);
    router.post('/sessions/revoke-others', closedInDemo);
    router.post('/identities/:provider/:action', closedInDemo);
    // Demo accounts end with "End demo" (deleteDemo), never through this.
    router.get('/deletion', closedInDemo);
    router.post('/delete', closedInDemo);
  }

  router.get('/deletion', async (req, res) => {
    const body: AccountDeletionPreview = await previewDeletion(getAuth(req).userId);
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/delete', rateLimiter(5, { perUser: true }), async (req, res) => {
    const input = deleteAccountInputSchema.parse(req.body);
    const auth = getAuth(req);
    const result = await deleteAccount(auth, input);
    // The user id is pseudonymous and what the restore runbook needs to repeat this.
    req.log.info({ event: 'account.deleted', userId: auth.userId, ...result }, 'Account deleted');
    clearRefreshCookie(res);
    res.status(204).end();
  });

  // Connect: step-up here, then the provider; the callback binds to this session.
  router.post(
    '/identities/:provider/connect',
    rateLimiter(10, { perUser: true }),
    async (req, res) => {
      const provider = providerFor(req);
      const { currentPassword } = stepUpInputSchema.parse(req.body ?? {});
      await prepareConnect(getAuth(req), provider.config.id, currentPassword);
      await sendProviderRedirect(req, res, provider, 'connect', undefined);
    },
  );

  // Re-authenticate with a connected provider (accounts without a password), then come back.
  router.post(
    '/identities/:provider/reauth',
    rateLimiter(10, { perUser: true }),
    async (req, res) => {
      const provider = providerFor(req);
      const input = reauthInputSchema.parse(req.body ?? {});
      await prepareReauth(getAuth(req), provider.config.id);
      const redirect = safeRedirectPath(
        input.redirect ?? '/account',
        oauth?.appOrigin ?? 'http://localhost',
      );
      await sendProviderRedirect(req, res, provider, 'reauth', redirect);
    },
  );

  router.post(
    '/identities/:provider/disconnect',
    rateLimiter(10, { perUser: true }),
    async (req, res) => {
      const { currentPassword } = stepUpInputSchema.parse(req.body ?? {});
      const auth = getAuth(req);
      // Also for providers no longer configured: an old identity can still be removed.
      const parsed = oauthProviderIdSchema.safeParse(req.params.provider);
      if (!parsed.success) throw new HttpError(404, 'Unknown sign-in provider', 'NOT_FOUND');
      const provider = parsed.data;
      const { revoked } = await disconnectIdentity(auth, provider, currentPassword);
      req.log.info(
        {
          event: 'account.identity_disconnected',
          userId: auth.userId,
          provider,
          revokedSessions: revoked,
        },
        'Provider disconnected',
      );
      res.status(204).end();
    },
  );

  router.patch('/', rateLimiter(30, { perUser: true }), async (req, res) => {
    const input = updateProfileInputSchema.parse(req.body);
    const body: ProfileResponse = { user: await updateProfile(getAuth(req).userId, input) };
    res.json(body);
  });

  router.patch('/preferences', rateLimiter(30, { perUser: true }), async (req, res) => {
    const input = updatePreferencesInputSchema.parse(req.body);
    const body: ProfileResponse = { user: await updatePreferences(getAuth(req).userId, input) };
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
