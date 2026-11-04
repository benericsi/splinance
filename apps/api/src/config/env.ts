import { z } from 'zod';

/** Who may create an account (see REGISTRATION below). */
export const REGISTRATION_MODES = ['open', 'allowlist', 'closed'] as const;

/** http only for a fake provider on this machine (tests, e2e); real providers are https. */
export function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** The database name in a postgres:// URL (`splinance_demo` in `postgres://u:p@host/splinance_demo`). */
export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // The same database as the schema owner, for migrations only; the API connects with
    // DATABASE_URL, a role that cannot change the schema. Defaults to DATABASE_URL.
    MIGRATE_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    // Reverse proxies in front of the API whose X-Forwarded-For is trusted (0: none, the
    // client connects directly). Behind Caddy on Railway: 1 (Caddy sets it from the edge's
    // X-Real-IP). Rate limits key on the IP this yields, so never more than are really there.
    TRUST_PROXY: z.coerce.number().int().min(0).max(3).default(0),
    // open (development, tests), allowlist (production: only these emails), closed.
    // Unset means closed in production, so a forgotten variable never opens sign-ups.
    REGISTRATION: z.enum(REGISTRATION_MODES).optional(),
    // Comma-separated emails, compared lowercased.
    REGISTRATION_ALLOWLIST: z
      .string()
      .default('')
      .transform((list) =>
        list
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.email()).max(50)),

    // HS256 needs at least 256 bits of key material.
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    // Defaults to true in production; local http dev needs false.
    COOKIE_SECURE: z.stringbool().optional(),
    // End-to-end tests register many users from one IP; never allowed in production.
    RATE_LIMIT_DISABLED: z.stringbool().default(false),
    // The public demo instance: "Try the demo" sandboxes with seeded data. Only ever on its
    // own database (name ending in _demo), never on the production one.
    DEMO_MODE: z.stringbool().default(false),
    DEMO_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    DEMO_MAX_ACTIVE: z.coerce.number().int().positive().max(10_000).default(200),

    // Where the browser reaches this app (https://splinance.com). Provider redirect URIs are
    // built from it, never from the Host header. Required once a sign-in provider is set.
    APP_ORIGIN: z
      .url({ protocol: /^https?$/ })
      .transform((url) => new URL(url).origin)
      .optional(),
    // "Continue with Google": both or neither. The issuer is overridable for the fake
    // provider in tests and e2e (http only on localhost, never in production).
    OAUTH_GOOGLE_CLIENT_ID: z.string().trim().min(1).max(512).optional(),
    OAUTH_GOOGLE_CLIENT_SECRET: z.string().trim().min(1).max(512).optional(),
    OAUTH_GOOGLE_ISSUER: z.url({ protocol: /^https?$/ }).default('https://accounts.google.com'),
  })
  .refine((e) => !(e.RATE_LIMIT_DISABLED && e.NODE_ENV === 'production'), {
    message: 'RATE_LIMIT_DISABLED must not be set in production',
    path: ['RATE_LIMIT_DISABLED'],
  })
  .refine((e) => !e.DEMO_MODE || databaseName(e.DATABASE_URL).endsWith('_demo'), {
    message: 'DEMO_MODE needs its own database whose name ends in _demo',
    path: ['DEMO_MODE'],
  })
  .refine((e) => e.REGISTRATION !== 'allowlist' || e.REGISTRATION_ALLOWLIST.length > 0, {
    message: 'REGISTRATION=allowlist needs at least one email in REGISTRATION_ALLOWLIST',
    path: ['REGISTRATION_ALLOWLIST'],
  })
  .refine((e) => !e.OAUTH_GOOGLE_CLIENT_ID === !e.OAUTH_GOOGLE_CLIENT_SECRET, {
    message: 'Set both OAUTH_GOOGLE_CLIENT_ID and OAUTH_GOOGLE_CLIENT_SECRET, or neither',
    path: ['OAUTH_GOOGLE_CLIENT_SECRET'],
  })
  // The demo database must only hold seeded sandboxes, never a real person's account.
  .refine((e) => !(e.DEMO_MODE && e.OAUTH_GOOGLE_CLIENT_ID), {
    message: 'Sign-in providers are not allowed on the demo instance',
    path: ['OAUTH_GOOGLE_CLIENT_ID'],
  })
  .refine((e) => !e.OAUTH_GOOGLE_CLIENT_ID || e.APP_ORIGIN, {
    message: 'APP_ORIGIN is required when a sign-in provider is configured',
    path: ['APP_ORIGIN'],
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.APP_ORIGIN?.startsWith('http:')), {
    message: 'APP_ORIGIN must be https in production',
    path: ['APP_ORIGIN'],
  })
  .refine(
    (e) => {
      const issuer = new URL(e.OAUTH_GOOGLE_ISSUER);
      return issuer.protocol === 'https:' || (e.NODE_ENV !== 'production' && isLocalHttp(issuer));
    },
    {
      message: 'OAUTH_GOOGLE_ISSUER must be https (http only for localhost outside production)',
      path: ['OAUTH_GOOGLE_ISSUER'],
    },
  )
  // Migrating one database while the API runs on another would leave the API's schema behind.
  .refine(
    (e) =>
      !e.MIGRATE_DATABASE_URL ||
      databaseName(e.MIGRATE_DATABASE_URL) === databaseName(e.DATABASE_URL),
    {
      message: 'MIGRATE_DATABASE_URL must point at the same database as DATABASE_URL',
      path: ['MIGRATE_DATABASE_URL'],
    },
  )
  // The example value is long enough to pass the length check; it must never sign real tokens.
  .refine((e) => !(e.NODE_ENV === 'production' && e.JWT_ACCESS_SECRET.startsWith('change-me')), {
    message: 'JWT_ACCESS_SECRET still has the example value; generate a random one',
    path: ['JWT_ACCESS_SECRET'],
  })
  .transform((e) => ({
    ...e,
    COOKIE_SECURE: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    REGISTRATION: e.REGISTRATION ?? (e.NODE_ENV === 'production' ? 'closed' : 'open'),
  }));

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Fail fast at boot instead of crashing later on a missing value.
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
