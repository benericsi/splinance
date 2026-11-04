import * as oidc from 'openid-client';
import { type Env, isLocalHttp } from '../../../config/env';

/**
 * Sign-in providers ("Continue with Google"). A provider is config plus an adapter: OIDC
 * providers (Google, Microsoft) share `createOidcProvider`; GitHub (plain OAuth 2) or Apple
 * (form_post, JWT client secret) would get adapters of their own behind the same interface.
 */
export interface OAuthProviderConfig {
  /** URL segment and `user_identities.provider`; lowercase slug. */
  id: string;
  issuer: URL;
  clientId: string;
  clientSecret: string;
  scopes: readonly string[];
  /** Extra authorization parameters (Google: always show the account chooser). */
  authParams?: Readonly<Record<string, string>>;
  /**
   * Whether this provider's verified email may offer to connect an existing account with
   * that email (still only after the password). False for providers whose email claim is
   * not verified (Microsoft Entra).
   */
  linkByEmail: boolean;
}

/** What a provider tells us about the person, before our own checks. */
export interface ExternalIdentity {
  subject: unknown;
  email: unknown;
  emailVerified: unknown;
  name: unknown;
}

export interface OAuthProvider {
  config: OAuthProviderConfig;
  authorizationUrl(input: {
    redirectUri: string;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<URL>;
  /** `callbackUrl` is the redirect URI plus the query the provider sent back. */
  exchange(input: {
    callbackUrl: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<ExternalIdentity>;
}

const DISCOVERY_TIMEOUT_SECONDS = 10;

/**
 * OpenID Connect through `openid-client`: discovery, PKCE S256, and ID token validation
 * (iss, aud, azp, exp, iat, nonce). The library skips the ID token's signature by default
 * when the token comes straight from the token endpoint (OIDC allows trusting TLS there);
 * `enableNonRepudiationChecks` verifies it against the provider's JWKS anyway, so a token
 * endpoint answer we did not expect (a misconfigured issuer, a proxy) cannot slip in a
 * forged identity. Discovery runs on
 * first use and is cached; a failed discovery is not, so the next sign-in retries instead of
 * failing until a restart, and an outage at the provider never blocks the API from booting.
 */
export function createOidcProvider(config: OAuthProviderConfig): OAuthProvider {
  let discovered: Promise<oidc.Configuration> | undefined;

  function configuration(): Promise<oidc.Configuration> {
    discovered ??= oidc
      .discovery(config.issuer, config.clientId, config.clientSecret, undefined, {
        timeout: DISCOVERY_TIMEOUT_SECONDS,
        execute: [
          oidc.enableNonRepudiationChecks,
          // The fake provider in tests runs on http://localhost; env validation refuses
          // http issuers anywhere else and in production.
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- only for the local fake
          ...(isLocalHttp(config.issuer) ? [oidc.allowInsecureRequests] : []),
        ],
      })
      .catch((err: unknown) => {
        discovered = undefined;
        throw err;
      });
    return discovered;
  }

  return {
    config,
    async authorizationUrl({ redirectUri, state, nonce, codeVerifier }) {
      return oidc.buildAuthorizationUrl(await configuration(), {
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: config.scopes.join(' '),
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        ...config.authParams,
      });
    },
    async exchange({ callbackUrl, state, nonce, codeVerifier }) {
      const tokens = await oidc.authorizationCodeGrant(await configuration(), callbackUrl, {
        expectedState: state,
        expectedNonce: nonce,
        pkceCodeVerifier: codeVerifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error('The provider returned no ID token');
      return {
        subject: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified,
        name: claims.name,
      };
    },
  };
}

/** The providers configured through env variables (none on the demo: env refuses them). */
export function providersFromEnv(env: Env): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (env.OAUTH_GOOGLE_CLIENT_ID && env.OAUTH_GOOGLE_CLIENT_SECRET) {
    providers.push(
      createOidcProvider({
        id: 'google',
        issuer: new URL(env.OAUTH_GOOGLE_ISSUER),
        clientId: env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
        scopes: ['openid', 'email', 'profile'],
        authParams: { prompt: 'select_account' },
        linkByEmail: true,
      }),
    );
  }
  return providers;
}
