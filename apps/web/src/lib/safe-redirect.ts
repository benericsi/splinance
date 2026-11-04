import { safeRedirectPath } from '@splinance/shared';
import { z } from 'zod';

/**
 * Only same-app paths are allowed after login (open redirect protection). The rules live in
 * the shared package because the API checks the same thing before a provider sign-in.
 */
export function safeRedirect(target: string | undefined): string {
  return safeRedirectPath(target, window.location.origin);
}

/** Search params for /login and /register. Invalid values are dropped, not errors. */
export const redirectSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
});
