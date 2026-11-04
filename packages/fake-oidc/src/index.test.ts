import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeOidc, startFakeOidc } from './index';

const clientId = 'test-client';
const clientSecret = 'test-secret';
const redirectUri = 'http://localhost:5173/api/auth/oauth/google/callback';
const verifier = 'v'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');

let fake: FakeOidc;

beforeAll(async () => {
  fake = await startFakeOidc({ clientId, clientSecret });
});

afterAll(async () => {
  await fake.close();
});

function authorizeUrl(overrides: Record<string, string> = {}) {
  const url = new URL(`${fake.issuer}/authorize`);
  const params = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: 'state-1',
    nonce: 'nonce-1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...overrides,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

async function codeFor(overrides: Record<string, string> = {}) {
  const res = await fetch(authorizeUrl(overrides), { redirect: 'manual' });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location') ?? '');
  return location;
}

function tokenRequest(code: string, extra: Record<string, string> = {}) {
  return fetch(`${fake.issuer}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: clientId,
      client_secret: clientSecret,
      ...extra,
    }),
  });
}

describe('fake OIDC provider', () => {
  it('publishes discovery and keys', async () => {
    const config = (await (
      await fetch(`${fake.issuer}/.well-known/openid-configuration`)
    ).json()) as { issuer: string; jwks_uri: string };
    expect(config.issuer).toBe(fake.issuer);
    const jwks = (await (await fetch(config.jwks_uri)).json()) as { keys: unknown[] };
    expect(jwks.keys).toHaveLength(1);
  });

  it('runs the code flow with PKCE and signs an ID token with the queued claims', async () => {
    fake.nextLogin({ sub: 'sub-1', email: 'anna@example.com', name: 'Anna' });
    const back = await codeFor();
    expect(back.searchParams.get('state')).toBe('state-1');
    const code = back.searchParams.get('code') ?? '';

    const res = await tokenRequest(code);
    expect(res.status).toBe(200);
    const { id_token: idToken } = (await res.json()) as { id_token: string };
    const { payload } = await jwtVerify(
      idToken,
      createRemoteJWKSet(new URL(`${fake.issuer}/jwks`)),
      { issuer: fake.issuer, audience: clientId },
    );
    expect(payload).toMatchObject({
      sub: 'sub-1',
      email: 'anna@example.com',
      email_verified: true,
      name: 'Anna',
      nonce: 'nonce-1',
    });

    // Codes are single use.
    expect((await tokenRequest(code)).status).toBe(400);
  });

  it('rejects a wrong verifier or client secret', async () => {
    fake.nextLogin();
    const code = (await codeFor()).searchParams.get('code') ?? '';
    expect((await tokenRequest(code, { code_verifier: 'w'.repeat(43) })).status).toBe(400);

    fake.nextLogin();
    const other = (await codeFor()).searchParams.get('code') ?? '';
    expect((await tokenRequest(other, { client_secret: 'nope' })).status).toBe(401);
  });

  it('answers a cancelled sign-in with access_denied', async () => {
    fake.nextLogin({ action: 'deny' });
    const back = await codeFor();
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('code')).toBeNull();
  });

  it('refuses requests without PKCE', async () => {
    const res = await fetch(authorizeUrl({ code_challenge_method: 'plain' }), {
      redirect: 'manual',
    });
    expect(res.status).toBe(400);
  });

  it('renders a sign-in form when nothing is queued, and escapes what it echoes', async () => {
    const res = await fetch(authorizeUrl({ state: '"><script>x</script>' }));
    const page = await res.text();
    expect(page).toContain('<form method="post" action="/authorize">');
    expect(page).not.toContain('<script>x</script>');
  });
});
