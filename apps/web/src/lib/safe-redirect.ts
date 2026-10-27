import { z } from 'zod';

const DEFAULT_REDIRECT = '/';

/**
 * Only same-app paths are allowed after login. Rejects absolute URLs, protocol-relative
 * tricks (`//evil.com`, `/\evil.com`) and control characters, which URL parsing drops
 * (`/<tab>/evil.com` becomes `//evil.com`). What is left is resolved the way the browser
 * would and must stay on this origin, to prevent open redirects.
 */
export function safeRedirect(target: string | undefined): string {
  if (!target?.startsWith('/') || target.startsWith('//')) return DEFAULT_REDIRECT;
  for (let i = 0; i < target.length; i++) {
    const code = target.charCodeAt(i);
    // Control characters and space, DEL, backslash.
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return DEFAULT_REDIRECT;
  }
  const { origin } = window.location;
  const url = new URL(target, origin);
  if (url.origin !== origin) return DEFAULT_REDIRECT;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Search params for /login and /register. Invalid values are dropped, not errors. */
export const redirectSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
});
