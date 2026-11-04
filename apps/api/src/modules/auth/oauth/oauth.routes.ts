import { timingSafeEqual } from 'node:crypto';
import {
  type OAuthErrorCode,
  type OAuthPendingLinkResponse,
  safeRedirectPath,
} from '@splinance/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../../lib/http-error';
import { generateToken } from '../../../lib/random-token';
import { rateLimiter } from '../../../middleware/rate-limit';
import type { RegistrationPolicy } from '../auth.service';
import { setRefreshCookie } from '../refresh-cookie';
import { clearOAuthCookie, readOAuthCookie, setOAuthCookie } from './cookies';
import { signInWithProvider, verifyIdentity } from './oauth.service';
import type { OAuthProvider } from './providers';

export interface OAuthDeps {
  /** Public origin of the app (APP_ORIGIN); redirect URIs are built from it, never from Host. */
  appOrigin: string;
  providers: readonly OAuthProvider[];
}

// Upper bounds for what a provider sends back; anything else in the query is ignored.
const callbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(64).optional(),
});

/** Where the browser lands after a provider sign-in: /login, whose guard sends a signed-in user on. */
function loginUrl({
  error,
  link = false,
  redirect,
}: {
  error?: OAuthErrorCode;
  link?: boolean;
  redirect: string | undefined;
}): string {
  const params = new URLSearchParams();
  if (error) params.set('oauth_error', error);
  if (link) params.set('oauth', 'link');
  if (redirect && redirect !== '/') params.set('redirect', redirect);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Error names only: library errors may carry response bodies, and never log codes or tokens. */
function errorName(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown';
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? `${err.name}:${code}` : err.name;
}

/**
 * Provider sign-in, mounted at /api/auth/oauth (not on the demo instance):
 * GET /:provider/start (a plain link, top-level navigation), GET /:provider/callback (the
 * provider redirects here), GET /link (the provider account waiting for a password login).
 * Browser-facing routes answer with redirects, never JSON, because the browser is navigating.
 */
export function createOAuthRouter({
  oauth,
  registration,
}: {
  oauth: OAuthDeps;
  registration: RegistrationPolicy;
}) {
  const router = Router();
  const providers = new Map(oauth.providers.map((p) => [p.config.id, p]));

  function providerFor(req: Request): OAuthProvider {
    const provider = providers.get(String(req.params.provider));
    if (!provider) throw new HttpError(404, 'Unknown sign-in provider', 'NOT_FOUND');
    return provider;
  }

  const redirectUriFor = (provider: OAuthProvider) =>
    `${oauth.appOrigin}/api/auth/oauth/${provider.config.id}/callback`;

  router.get('/link', async (req, res) => {
    const pending = await readOAuthCookie(req, 'link');
    if (!pending) throw new HttpError(404, 'No sign-in is waiting to be connected', 'NOT_FOUND');
    const body: OAuthPendingLinkResponse = { provider: pending.provider, email: pending.email };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/:provider/start', rateLimiter(30), async (req, res) => {
    const provider = providerFor(req);
    const requested = typeof req.query.redirect === 'string' ? req.query.redirect : undefined;
    const redirect = requested ? safeRedirectPath(requested, oauth.appOrigin) : undefined;
    const flow = {
      provider: provider.config.id,
      state: generateToken(),
      nonce: generateToken(),
      codeVerifier: generateToken(),
      redirect,
    };

    let url: URL;
    try {
      url = await provider.authorizationUrl({ ...flow, redirectUri: redirectUriFor(provider) });
    } catch (err) {
      req.log.warn(
        { provider: provider.config.id, reason: 'discovery failed', error: errorName(err) },
        'Provider sign-in unavailable',
      );
      res.redirect(303, loginUrl({ error: 'unavailable', redirect }));
      return;
    }

    await setOAuthCookie(res, 'flow', flow);
    res.set('Cache-Control', 'no-store').redirect(303, url.href);
  });

  router.get('/:provider/callback', rateLimiter(30), async (req, res) => {
    const provider = providerFor(req);
    const id = provider.config.id;
    // Single use: cleared whatever happens next.
    const flow = await readOAuthCookie(req, 'flow');
    clearOAuthCookie(res, 'flow');
    res.set('Cache-Control', 'no-store');

    const reject = (code: OAuthErrorCode, reason: string, err?: unknown) => {
      req.log.warn(
        { provider: id, reason, ...(err !== undefined && { error: errorName(err) }) },
        'Provider sign-in failed',
      );
      res.redirect(303, loginUrl({ error: code, redirect: flow?.redirect }));
    };

    const query = callbackQuerySchema.safeParse(req.query);
    if (!query.success) {
      reject('failed', 'malformed callback');
      return;
    }
    const { code, state, error } = query.data;
    if (error) {
      reject(error === 'access_denied' ? 'cancelled' : 'failed', 'provider returned an error');
      return;
    }
    // Missing, tampered with, expired, another provider's, or overwritten by a newer flow in
    // another tab: all look the same to the person ("try again").
    if (flow?.provider !== id) {
      reject('expired', 'no flow cookie');
      return;
    }
    if (!state || !sameToken(state, flow.state)) {
      reject('expired', 'state mismatch');
      return;
    }
    if (!code) {
      reject('failed', 'no code');
      return;
    }

    const callbackUrl = new URL(redirectUriFor(provider));
    callbackUrl.search = new URL(req.originalUrl, oauth.appOrigin).search;
    let external;
    try {
      external = await provider.exchange({
        callbackUrl,
        state: flow.state,
        nonce: flow.nonce,
        codeVerifier: flow.codeVerifier,
      });
    } catch (err) {
      reject('failed', 'code exchange or ID token rejected', err);
      return;
    }

    const identity = verifyIdentity(id, external);
    if (!('subject' in identity)) {
      reject(identity.code, identity.reason);
      return;
    }

    const outcome = await signInWithProvider(provider.config, identity, registration);
    switch (outcome.kind) {
      case 'session':
        if (outcome.result.refreshCookie) setRefreshCookie(res, outcome.result.refreshCookie);
        res.redirect(303, loginUrl({ redirect: flow.redirect }));
        return;
      case 'link':
        await setOAuthCookie(res, 'link', outcome.pending);
        res.redirect(303, loginUrl({ link: true, redirect: flow.redirect }));
        return;
      case 'rejected':
        reject(outcome.code, outcome.reason);
        return;
    }
  });

  return router;
}
