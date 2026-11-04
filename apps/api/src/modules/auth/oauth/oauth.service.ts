import { emailSchema, type OAuthErrorCode } from '@splinance/shared';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { isUniqueViolation } from '../../../db/errors';
import { userIdentities, users } from '../../../db/schema';
import {
  type AuthResult,
  createSession,
  isRegistrationAllowed,
  type PendingLink,
  type RegistrationPolicy,
} from '../auth.service';
import type { ExternalIdentity, OAuthProviderConfig } from './providers';

/** A provider's answer after our own checks (on top of the ID token validation). */
export interface VerifiedIdentity {
  provider: string;
  subject: string;
  email: string;
  name: string | undefined;
}

export type Rejection = { code: OAuthErrorCode; reason: string };

export type SignInOutcome =
  | { kind: 'session'; result: AuthResult }
  /** The email belongs to a password account: connect only after its password (login). */
  | { kind: 'link'; pending: PendingLink }
  | ({ kind: 'rejected' } & Rejection);

const DISPLAY_NAME_MAX = 50;

/**
 * Claims we rely on: `sub` (the stable id; never the email), a valid email, and
 * `email_verified === true` exactly (not "truthy": some providers send strings).
 */
export function verifyIdentity(
  provider: string,
  identity: ExternalIdentity,
): VerifiedIdentity | Rejection {
  const { subject, emailVerified, name } = identity;
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 255) {
    return { code: 'failed', reason: 'invalid subject' };
  }
  const email = emailSchema.safeParse(identity.email);
  if (!email.success) return { code: 'failed', reason: 'missing or invalid email' };
  if (emailVerified !== true) return { code: 'email_unverified', reason: 'email not verified' };
  return {
    provider,
    subject,
    email: email.data,
    name: typeof name === 'string' ? name : undefined,
  };
}

/** The provider's name, else the email's local part; at most 50 characters (code points). */
export function displayNameFor(identity: Pick<VerifiedIdentity, 'email' | 'name'>): string {
  const clamp = (value: string) =>
    Array.from(value.trim()).slice(0, DISPLAY_NAME_MAX).join('').trim();
  return (
    clamp(identity.name ?? '') || clamp(identity.email.split('@')[0] ?? '') || 'Splinance user'
  );
}

/**
 * Resolves a verified provider identity to a session:
 * 1. a known (provider, sub): sign in, even when registration is closed (like password login);
 * 2. an account with this email: a pending link, confirmed by that account's password
 *    (auto-linking would let whoever controls the provider-side email, or whoever registered
 *    the address first with a password, into the other person's account);
 * 3. otherwise a new account, if the registration policy allows the verified email.
 * A unique violation means a parallel sign-in or registration won the race; one retry then
 * takes the path for what exists now.
 */
export async function signInWithProvider(
  config: OAuthProviderConfig,
  identity: VerifiedIdentity,
  policy: RegistrationPolicy,
): Promise<SignInOutcome> {
  try {
    return await attempt(config, identity, policy);
  } catch (err) {
    if (
      isUniqueViolation(err, 'users_email_unique') ||
      isUniqueViolation(err, 'user_identities_provider_subject_unique')
    ) {
      return attempt(config, identity, policy);
    }
    throw err;
  }
}

function attempt(
  config: OAuthProviderConfig,
  identity: VerifiedIdentity,
  policy: RegistrationPolicy,
): Promise<SignInOutcome> {
  return db.transaction(async (tx): Promise<SignInOutcome> => {
    const byIdentity = and(
      eq(userIdentities.provider, identity.provider),
      eq(userIdentities.subject, identity.subject),
    );
    const [known] = await tx
      .select({ user: users })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(byIdentity);
    if (known) {
      await tx.update(userIdentities).set({ lastUsedAt: new Date() }).where(byIdentity);
      return { kind: 'session', result: await createSession(tx, known.user) };
    }

    const [existing] = await tx.select().from(users).where(eq(users.email, identity.email));
    if (existing) {
      if (!config.linkByEmail) {
        return { kind: 'rejected', code: 'conflict', reason: 'provider does not link by email' };
      }
      if (!existing.passwordHash) {
        return { kind: 'rejected', code: 'conflict', reason: 'account has no password' };
      }
      const [other] = await tx
        .select({ id: userIdentities.id })
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.userId, existing.id),
            eq(userIdentities.provider, identity.provider),
          ),
        );
      if (other) {
        return { kind: 'rejected', code: 'conflict', reason: 'account has another identity' };
      }
      return {
        kind: 'link',
        pending: { provider: identity.provider, subject: identity.subject, email: identity.email },
      };
    }

    if (!isRegistrationAllowed(policy, identity.email)) {
      return { kind: 'rejected', code: 'not_allowed', reason: 'registration policy' };
    }
    const [user] = await tx
      .insert(users)
      .values({ email: identity.email, passwordHash: null, displayName: displayNameFor(identity) })
      .returning();
    if (!user) throw new Error('User insert returned no row');
    await tx
      .insert(userIdentities)
      .values({ userId: user.id, provider: identity.provider, subject: identity.subject });
    return { kind: 'session', result: await createSession(tx, user) };
  });
}
