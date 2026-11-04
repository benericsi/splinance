import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';

/**
 * A minimal OpenID Connect provider for tests: discovery, JWKS, an authorization endpoint
 * and a token endpoint (authorization code with PKCE S256, client_secret_post or _basic).
 * It stands in for Google in API tests and e2e, so the real flow runs end to end without
 * network access or credentials. Never deployed.
 *
 * Who signs in: tests queue logins with `nextLogin()` (the authorization endpoint then
 * answers at once). With an empty queue it renders a small "Sign in as" form instead, which
 * e2e tests fill in like a person would.
 */

export interface FakeLogin {
  sub?: string;
  email?: string;
  /** Anything but `true` counts as unverified; `undefined` leaves the claim out. */
  emailVerified?: unknown;
  name?: string;
  /** `deny`: the person cancels at the provider (error=access_denied). */
  action?: 'approve' | 'deny';
  /** Tampering for negative tests: claims to override (`undefined` removes one), a foreign key. */
  idToken?: { claims?: Record<string, unknown>; foreignKey?: boolean };
}

export interface FakeOidcOptions {
  clientId: string;
  clientSecret: string;
  /** 0 (default) picks a free port. */
  port?: number;
  /**
   * Host name in the issuer URL (default localhost). e2e uses 127.0.0.1, another site than
   * the app on localhost, so the browser treats the round trip as cross-site like Google.
   */
  issuerHost?: string;
}

export interface FakeOidc {
  issuer: string;
  /** Queues the next sign-in; consumed by the next authorization request. */
  nextLogin(login?: FakeLogin): void;
  /** Number of token requests served (to assert that a flow never reached the provider). */
  tokenRequests(): number;
  close(): Promise<void>;
}

interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

interface IssuedCode extends AuthorizationRequest {
  login: FakeLogin;
  expiresAt: number;
  used: boolean;
}

const CODE_TTL_MS = 60_000;

export async function startFakeOidc(options: FakeOidcOptions): Promise<FakeOidc> {
  const { clientId, clientSecret } = options;
  const kid = randomUUID();
  const keys = await generateKeyPair('RS256');
  const foreignKeys = await generateKeyPair('RS256');
  const publicJwk = { ...(await exportJWK(keys.publicKey)), kid, alg: 'RS256', use: 'sig' };

  const queue: FakeLogin[] = [];
  const codes = new Map<string, IssuedCode>();
  let tokenRequestCount = 0;
  let issuer = '';

  function issueCode(request: AuthorizationRequest, login: FakeLogin): string {
    const code = randomBytes(24).toString('base64url');
    codes.set(code, { ...request, login, expiresAt: Date.now() + CODE_TTL_MS, used: false });
    return code;
  }

  function redirectBack(res: ServerResponse, request: AuthorizationRequest, login: FakeLogin) {
    const target = new URL(request.redirectUri);
    if (login.action === 'deny') {
      target.searchParams.set('error', 'access_denied');
    } else {
      target.searchParams.set('code', issueCode(request, login));
    }
    target.searchParams.set('state', request.state);
    res.writeHead(302, { Location: target.toString() }).end();
  }

  async function signIdToken(entry: IssuedCode): Promise<string> {
    const { login } = entry;
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      iss: issuer,
      aud: entry.clientId,
      sub: login.sub ?? randomUUID().replaceAll('-', ''),
      iat: now,
      exp: now + 300,
      nonce: entry.nonce,
      email: login.email ?? `${randomUUID()}@example.com`,
      name: login.name,
      // Verified unless the test says otherwise; an explicit `undefined` leaves the claim out.
      email_verified: 'emailVerified' in login ? login.emailVerified : true,
    };
    for (const [claim, value] of Object.entries(login.idToken?.claims ?? {})) {
      if (value === undefined) Reflect.deleteProperty(payload, claim);
      else payload[claim] = value;
    }
    const key = login.idToken?.foreignKey ? foreignKeys.privateKey : keys.privateKey;
    return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid }).sign(key);
  }

  function parseAuthorization(params: URLSearchParams): AuthorizationRequest | string {
    if (params.get('response_type') !== 'code') return 'response_type must be code';
    if (params.get('client_id') !== clientId) return 'unknown client_id';
    if (params.get('code_challenge_method') !== 'S256') return 'PKCE S256 is required';
    const request = {
      clientId,
      redirectUri: params.get('redirect_uri') ?? '',
      state: params.get('state') ?? '',
      nonce: params.get('nonce') ?? '',
      codeChallenge: params.get('code_challenge') ?? '',
    };
    if (!URL.canParse(request.redirectUri)) return 'redirect_uri is required';
    if (!request.state || !request.nonce || !request.codeChallenge) {
      return 'state, nonce and code_challenge are required';
    }
    return request;
  }

  async function token(req: IncomingMessage, res: ServerResponse) {
    tokenRequestCount++;
    const body = new URLSearchParams(await readBody(req));
    const basic = parseBasicAuth(req.headers.authorization);
    const id = basic?.id ?? body.get('client_id');
    const secret = basic?.secret ?? body.get('client_secret');
    if (id !== clientId || secret !== clientSecret) {
      json(res, 401, { error: 'invalid_client' });
      return;
    }
    const entry = codes.get(body.get('code') ?? '');
    const verifier = body.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (
      body.get('grant_type') !== 'authorization_code' ||
      !entry ||
      entry.used ||
      entry.expiresAt < Date.now() ||
      entry.redirectUri !== body.get('redirect_uri') ||
      entry.codeChallenge !== challenge
    ) {
      if (entry) entry.used = true;
      json(res, 400, { error: 'invalid_grant' });
      return;
    }
    entry.used = true;
    json(res, 200, {
      access_token: randomBytes(24).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: await signIdToken(entry),
    });
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', issuer);
    const route = `${req.method ?? 'GET'} ${url.pathname}`;

    switch (route) {
      case 'GET /.well-known/openid-configuration':
        json(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          scopes_supported: ['openid', 'email', 'profile'],
          claims_supported: ['sub', 'email', 'email_verified', 'name'],
        });
        return;
      case 'GET /jwks':
        json(res, 200, { keys: [publicJwk] });
        return;
      case 'GET /authorize': {
        const request = parseAuthorization(url.searchParams);
        if (typeof request === 'string') {
          json(res, 400, { error: 'invalid_request', error_description: request });
          return;
        }
        const queued = queue.shift();
        if (queued) redirectBack(res, request, queued);
        else html(res, signInPage(request));
        return;
      }
      case 'POST /authorize': {
        const form = new URLSearchParams(await readBody(req));
        const request = parseAuthorization(form);
        if (typeof request === 'string') {
          json(res, 400, { error: 'invalid_request', error_description: request });
          return;
        }
        const email = form.get('email')?.trim() ?? '';
        const name = form.get('name')?.trim() ?? '';
        const sub = form.get('sub')?.trim() ?? '';
        redirectBack(res, request, {
          action: form.get('action') === 'deny' ? 'deny' : 'approve',
          ...(email && { email }),
          ...(name && { name }),
          // Same email, same account: a stable sub per email unless one is given.
          sub: sub || createHash('sha256').update(email).digest('hex').slice(0, 21),
          emailVerified: form.get('email_verified') === 'on',
        });
        return;
      }
      case 'POST /token':
        await token(req, res);
        return;
      default:
        json(res, 404, { error: 'not_found' });
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      json(res, 500, { error: 'server_error', error_description: String(err) });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  issuer = `http://${options.issuerHost ?? 'localhost'}:${String(port)}`;

  return {
    issuer,
    nextLogin: (login = {}) => {
      queue.push(login);
    },
    tokenRequests: () => tokenRequestCount,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res
    .writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(body));
}

function html(res: ServerResponse, body: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBasicAuth(header: string | undefined): { id: string; secret: string } | undefined {
  if (!header?.startsWith('Basic ')) return undefined;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return undefined;
  return {
    id: decodeURIComponent(decoded.slice(0, colon)),
    secret: decodeURIComponent(decoded.slice(colon + 1)),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

function signInPage(request: AuthorizationRequest): string {
  const hidden = Object.entries({
    response_type: 'code',
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    state: request.state,
    nonce: request.nonce,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
  })
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake provider</title></head>
<body><h1>Sign in to the fake provider</h1>
<form method="post" action="/authorize">${hidden}
<label>Email <input name="email" type="email" required></label>
<label>Name <input name="name"></label>
<label>Subject <input name="sub"></label>
<label><input name="email_verified" type="checkbox" checked> Email verified</label>
<button name="action" value="approve">Approve</button>
<button name="action" value="deny" formnovalidate>Cancel</button>
</form></body></html>`;
}
