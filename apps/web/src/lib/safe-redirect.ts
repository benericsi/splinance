import { z } from 'zod';

const DEFAULT_REDIRECT = '/';

/**
 * Only same-app paths are allowed after login. Rejects absolute URLs and
 * protocol-relative tricks (`//evil.com`, `/\evil.com`) to prevent open redirects.
 */
export function safeRedirect(target: string | undefined): string {
  if (!target?.startsWith('/')) return DEFAULT_REDIRECT;
  if (target.startsWith('//') || target.startsWith('/\\')) return DEFAULT_REDIRECT;
  return target;
}

/** Search params for /login and /register. Invalid values are dropped, not errors. */
export const redirectSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
});
