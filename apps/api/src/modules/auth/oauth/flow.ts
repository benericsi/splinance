import type { Response } from 'express';
import { generateToken } from '../../../lib/random-token';
import { type FlowState, setOAuthCookie } from './cookies';
import type { OAuthProvider } from './providers';

/** The callback URL registered with the provider; from APP_ORIGIN, never the Host header. */
export function redirectUriFor(appOrigin: string, provider: OAuthProvider): string {
  return `${appOrigin}/api/auth/oauth/${provider.config.id}/callback`;
}

type Intent =
  { intent: 'signin' } | { intent: 'connect' | 'reauth'; userId: string; sessionId: string };

/**
 * Starts a provider round trip: fresh state, nonce and PKCE verifier, sealed into the flow
 * cookie with what the flow is for, and the provider's authorization URL to go to.
 * Throws when the provider's discovery fails (the caller answers "unavailable"); the
 * cookie is set only after that succeeded.
 */
export async function beginFlow(
  res: Response,
  {
    appOrigin,
    provider,
    redirect,
    ...intent
  }: { appOrigin: string; provider: OAuthProvider; redirect: string | undefined } & Intent,
): Promise<URL> {
  const flow: FlowState = {
    ...intent,
    provider: provider.config.id,
    state: generateToken(),
    nonce: generateToken(),
    codeVerifier: generateToken(),
    redirect,
  };
  const url = await provider.authorizationUrl({
    ...flow,
    redirectUri: redirectUriFor(appOrigin, provider),
  });
  await setOAuthCookie(res, 'flow', flow);
  return url;
}
