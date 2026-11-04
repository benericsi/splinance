import { hkdfSync } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';
import { env } from '../../../config/env';

/**
 * Two short-lived, encrypted cookies carry provider sign-in state, so nothing needs a table
 * or cleanup and any API instance can finish a flow another one started:
 *
 * - flow: state, nonce, PKCE verifier and the destination, from /start to /callback.
 *   SameSite=Lax because the provider's redirect to the callback is a cross-site top-level
 *   GET (Strict would never be sent). Safe: it only counts together with a matching `state`.
 * - link: a provider account waiting to be connected to the password account with its email,
 *   from /callback to POST /login. SameSite=Strict (only our own pages send it).
 *
 * Both are JWEs (dir + A256GCM): tamper-proof and opaque (the verifier stays secret). The key
 * is derived from JWT_ACCESS_SECRET with HKDF, one per purpose, so a link cookie can never be
 * read as a flow cookie and no extra secret has to be managed. `__Host-` (Secure, Path=/, no
 * Domain) stops a sibling host such as demo.splinance.com from planting its own value; local
 * http (COOKIE_SECURE=false) cannot use the prefix.
 */

const TTL_SECONDS = 10 * 60;

type Purpose = 'flow' | 'link';

function deriveKey(purpose: Purpose): Uint8Array {
  return new Uint8Array(
    hkdfSync('sha256', env.JWT_ACCESS_SECRET, '', `splinance oauth ${purpose} v1`, 32),
  );
}

const keys: Record<Purpose, Uint8Array> = { flow: deriveKey('flow'), link: deriveKey('link') };

const prefix = env.COOKIE_SECURE ? '__Host-' : '';

export const FLOW_COOKIE = `${prefix}splinance_oauth`;
export const LINK_COOKIE = `${prefix}splinance_oauth_link`;

function cookieOptions(sameSite: 'lax' | 'strict'): CookieOptions {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite, path: '/' };
}

const COOKIES = {
  flow: { name: FLOW_COOKIE, options: cookieOptions('lax') },
  link: { name: LINK_COOKIE, options: cookieOptions('strict') },
} as const;

const token = z.string().min(1).max(512);

export const flowStateSchema = z.object({
  provider: z.string().max(32),
  state: token,
  nonce: token,
  codeVerifier: token,
  redirect: z.string().max(2048).optional(),
});

export type FlowState = z.infer<typeof flowStateSchema>;

export const pendingLinkSchema = z.object({
  provider: z.string().max(32),
  subject: z.string().min(1).max(255),
  email: z.email(),
});

export type PendingLink = z.infer<typeof pendingLinkSchema>;

const SCHEMAS = { flow: flowStateSchema, link: pendingLinkSchema } as const;

type Payload<P extends Purpose> = z.infer<(typeof SCHEMAS)[P]>;

async function seal<P extends Purpose>(purpose: P, payload: Payload<P>): Promise<string> {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setAudience(`splinance-oauth-${purpose}`)
    .setIssuedAt()
    .setExpirationTime(`${String(TTL_SECONDS)}s`)
    .encrypt(keys[purpose]);
}

/** undefined when missing, tampered with, expired or for another purpose. */
async function open<P extends Purpose>(
  purpose: P,
  value: string | undefined,
): Promise<Payload<P> | undefined> {
  if (!value || value.length > 4096) return undefined;
  try {
    const { payload } = await jwtDecrypt(value, keys[purpose], {
      audience: `splinance-oauth-${purpose}`,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    const parsed = SCHEMAS[purpose].safeParse(payload);
    return parsed.success ? (parsed.data as Payload<P>) : undefined;
  } catch {
    return undefined;
  }
}

function read(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}

export async function setOAuthCookie<P extends Purpose>(
  res: Response,
  purpose: P,
  payload: Payload<P>,
): Promise<void> {
  const { name, options } = COOKIES[purpose];
  res.cookie(name, await seal(purpose, payload), { ...options, maxAge: TTL_SECONDS * 1000 });
}

export function readOAuthCookie<P extends Purpose>(
  req: Request,
  purpose: P,
): Promise<Payload<P> | undefined> {
  return open(purpose, read(req, COOKIES[purpose].name));
}

export function hasOAuthCookie(req: Request, purpose: Purpose): boolean {
  return read(req, COOKIES[purpose].name) !== undefined;
}

export function clearOAuthCookie(res: Response, purpose: Purpose): void {
  const { name, options } = COOKIES[purpose];
  res.clearCookie(name, options);
}
