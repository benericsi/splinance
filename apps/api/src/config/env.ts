import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

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
  })
  .refine((e) => !(e.RATE_LIMIT_DISABLED && e.NODE_ENV === 'production'), {
    message: 'RATE_LIMIT_DISABLED must not be set in production',
    path: ['RATE_LIMIT_DISABLED'],
  })
  .transform((e) => ({ ...e, COOKIE_SECURE: e.COOKIE_SECURE ?? e.NODE_ENV === 'production' }));

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
