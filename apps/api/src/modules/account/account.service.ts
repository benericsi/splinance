import {
  type AccountResponse,
  type ChangePasswordInput,
  requiredPasswordIssues,
  type UpdateProfileInput,
  type User,
} from '@splinance/shared';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import { sessions, type SessionRow, userIdentities, users, type UserRow } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { type AuthResult, createSession, toUser } from '../auth/auth.service';
import type { Rejection, VerifiedIdentity } from '../auth/oauth/oauth.service';
import { hashPassword, verifyPassword } from '../auth/passwords';

/**
 * How long after signing in an account without a password may change how it signs in.
 * `sessions.created_at` is the sign-in time: refresh rotates the row and never moves it.
 */
export const RECENT_SIGN_IN_MS = 10 * 60 * 1000;

/** Who is asking: the access token's user and session. */
export interface Caller {
  userId: string;
  sessionId: string;
}

const sessionEnded = () =>
  new HttpError(401, 'Your session has ended, please log in again', 'UNAUTHENTICATED');

// 400, not 401: the web client treats every 401 as an expired access token and retries.
const wrongPassword = () =>
  new HttpError(400, 'That is not your current password', 'WRONG_PASSWORD');

const reauthRequired = () =>
  new HttpError(403, 'Sign in again to confirm it is you', 'REAUTH_REQUIRED');

/**
 * Locks the user row. Every change to how a user signs in (password, providers, deletion)
 * takes this lock first, so "is there another way in?" and the change cannot interleave.
 */
export async function lockUser(executor: Db, userId: string): Promise<UserRow> {
  const [user] = await executor.select().from(users).where(eq(users.id, userId)).for('update');
  if (!user) throw sessionEnded();
  return user;
}

/** The caller's session while it is active (an access token outlives a logout), else undefined. */
async function findActiveSession(
  executor: Db,
  caller: Caller,
  now: Date,
): Promise<SessionRow | undefined> {
  const [session] = await executor
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, caller.sessionId),
        eq(sessions.userId, caller.userId),
        isNull(sessions.revokedAt),
      ),
    );
  return session && session.expiresAt > now ? session : undefined;
}

export async function activeSession(executor: Db, caller: Caller, now: Date): Promise<SessionRow> {
  const session = await findActiveSession(executor, caller, now);
  if (!session) throw sessionEnded();
  return session;
}

function isRecent(session: SessionRow, now: Date): boolean {
  return now.getTime() - session.createdAt.getTime() <= RECENT_SIGN_IN_MS;
}

/**
 * Step-up for changes that add or remove a way into the account. An account with a
 * password confirms with it every time; one without (it signs in only with a provider)
 * must have signed in within RECENT_SIGN_IN_MS. A stolen access token alone is then not
 * enough to set a password or connect another provider and keep the account.
 */
export async function requireRecentAuth(
  user: UserRow,
  session: SessionRow,
  currentPassword: string | undefined,
  now: Date,
): Promise<void> {
  if (user.passwordHash) {
    if (currentPassword && (await verifyPassword(user.passwordHash, currentPassword))) return;
    logger.warn({ event: 'account.step_up_failed', userId: user.id }, 'Wrong current password');
    throw wrongPassword();
  }
  if (!isRecent(session, now)) throw reauthRequired();
}

/** Signs out every other session of the user; the caller's own stays. */
async function revokeOthers(executor: Db, caller: Caller, now: Date): Promise<number> {
  const revoked = await executor
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, caller.userId),
        ne(sessions.id, caller.sessionId),
        isNull(sessions.revokedAt),
      ),
    )
    .returning({ id: sessions.id });
  return revoked.length;
}

export async function getAccount(
  caller: Caller,
  providerIds: readonly string[],
  now = new Date(),
): Promise<AccountResponse> {
  const { userId } = caller;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.deletedAt) throw sessionEnded();
  const session = await findActiveSession(db, caller, now);
  const identities = await db
    .select({
      provider: userIdentities.provider,
      createdAt: userIdentities.createdAt,
      lastUsedAt: userIdentities.lastUsedAt,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))
    .orderBy(asc(userIdentities.provider));
  return {
    user: toUser(user),
    hasPassword: user.passwordHash !== null,
    identities: identities.map((identity) => ({
      provider: identity.provider,
      connectedAt: identity.createdAt.toISOString(),
      lastUsedAt: identity.lastUsedAt.toISOString(),
    })),
    providers: providerIds.map((id) => ({ id })),
    recentSignIn: session !== undefined && isRecent(session, now),
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
  const [user] = await db
    .update(users)
    .set({
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.locale !== undefined && { locale: input.locale }),
    })
    .where(eq(users.id, userId))
    .returning();
  if (!user) throw sessionEnded();
  return toUser(user);
}

export interface PasswordChange {
  /** true when the account had no password before (it signed in only with a provider). */
  firstPassword: boolean;
  /** Other sessions signed out. */
  revoked: number;
}

/**
 * Changes the password (the current one confirms it) or sets a first one (a recent
 * sign-in confirms it), then signs out every other session: whoever knew the old password
 * or holds a stolen session is out, this device stays signed in.
 */
export async function changePassword(
  caller: Caller,
  input: ChangePasswordInput,
  now = new Date(),
): Promise<PasswordChange> {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, caller.userId);
    const session = await activeSession(tx, caller, now);
    await requireRecentAuth(user, session, input.currentPassword, now);

    // The rules need the account's own email and name, not what a client claims.
    const [issue] = requiredPasswordIssues(input.newPassword, {
      email: user.email,
      displayName: user.displayName,
    });
    if (issue) throw new HttpError(400, issue, 'WEAK_PASSWORD');

    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword) })
      .where(eq(users.id, user.id));
    return {
      firstPassword: user.passwordHash === null,
      revoked: await revokeOthers(tx, caller, now),
    };
  });
}

/** "Sign out of other devices". */
export async function revokeOtherSessions(caller: Caller, now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    await activeSession(tx, caller, now);
    return revokeOthers(tx, caller, now);
  });
}

const identityNotFound = () =>
  new HttpError(404, 'That sign-in method is not connected', 'IDENTITY_NOT_FOUND');

function identityOf(executor: Db, userId: string, provider: string) {
  return executor
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)));
}

/**
 * Before leaving for the provider to connect it: step-up, and the provider must not be
 * connected yet (one account per provider and user). The callback checks again.
 */
export async function prepareConnect(
  caller: Caller,
  provider: string,
  currentPassword: string | undefined,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, caller.userId);
    const session = await activeSession(tx, caller, now);
    const [existing] = await identityOf(tx, user.id, provider);
    if (existing) {
      throw new HttpError(409, 'That provider is already connected', 'ALREADY_CONNECTED');
    }
    await requireRecentAuth(user, session, currentPassword, now);
  });
}

/** Before leaving for the provider to re-authenticate: it must be connected. */
export async function prepareReauth(caller: Caller, provider: string, now = new Date()) {
  await activeSession(db, caller, now);
  const [existing] = await identityOf(db, caller.userId, provider);
  if (!existing) throw identityNotFound();
}

export type ConnectOutcome = { kind: 'connected' } | ({ kind: 'rejected' } & Rejection);

/**
 * The callback of a connect flow. Bound to the session that started it (from the flow
 * cookie): logged out or signed out by a password change meanwhile means "expired".
 * Matching is by `(provider, sub)` only; the provider account's email may differ from the
 * Splinance one.
 */
export async function connectIdentity(
  caller: Caller,
  identity: VerifiedIdentity,
  now = new Date(),
): Promise<ConnectOutcome> {
  try {
    return await db.transaction(async (tx): Promise<ConnectOutcome> => {
      await lockUser(tx, caller.userId);
      if (!(await findActiveSession(tx, caller, now))) {
        return { kind: 'rejected', code: 'expired', reason: 'starting session ended' };
      }
      const [owner] = await tx
        .select({ userId: userIdentities.userId })
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.provider, identity.provider),
            eq(userIdentities.subject, identity.subject),
          ),
        );
      if (owner) {
        return owner.userId === caller.userId
          ? { kind: 'connected' }
          : { kind: 'rejected', code: 'taken', reason: 'provider account used by another user' };
      }
      const [other] = await identityOf(tx, caller.userId, identity.provider);
      if (other) {
        return { kind: 'rejected', code: 'conflict', reason: 'another account of the provider' };
      }
      await tx.insert(userIdentities).values({
        userId: caller.userId,
        provider: identity.provider,
        subject: identity.subject,
        lastUsedAt: now,
      });
      return { kind: 'connected' };
    });
  } catch (err) {
    // Another user connected (or signed up with) the same provider account at this moment.
    if (isUniqueViolation(err, 'user_identities_provider_subject_unique')) {
      return { kind: 'rejected', code: 'taken', reason: 'provider account used by another user' };
    }
    if (isUniqueViolation(err, 'user_identities_user_provider_unique')) {
      return { kind: 'rejected', code: 'conflict', reason: 'another account of the provider' };
    }
    throw err;
  }
}

export type ReauthOutcome =
  { kind: 'session'; result: AuthResult } | ({ kind: 'rejected' } & Rejection);

/**
 * The callback of a reauth flow: the provider account must be the one connected to this
 * user (another one would sign into another account, or nowhere). A fresh session replaces
 * the one that started the flow, so its `created_at` counts as a recent sign-in.
 */
export async function reauthenticate(
  caller: Caller,
  identity: VerifiedIdentity,
  now = new Date(),
): Promise<ReauthOutcome> {
  return db.transaction(async (tx): Promise<ReauthOutcome> => {
    const user = await lockUser(tx, caller.userId);
    if (!(await findActiveSession(tx, caller, now))) {
      return { kind: 'rejected', code: 'expired', reason: 'starting session ended' };
    }
    const [connected] = await identityOf(tx, user.id, identity.provider);
    if (connected?.subject !== identity.subject) {
      return { kind: 'rejected', code: 'wrong_account', reason: 'another provider account' };
    }
    await tx
      .update(userIdentities)
      .set({ lastUsedAt: now })
      .where(eq(userIdentities.id, connected.id));
    await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, caller.sessionId));
    return { kind: 'session', result: await createSession(tx, user) };
  });
}

/**
 * Disconnects a provider account. Never the last way in: without a password and without
 * another provider the account could not be signed into any more. The user row lock makes
 * that check and the delete one step against parallel changes. Other sessions are signed
 * out (some may have signed in through this provider).
 */
export async function disconnectIdentity(
  caller: Caller,
  provider: string,
  currentPassword: string | undefined,
  now = new Date(),
): Promise<{ revoked: number }> {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, caller.userId);
    const session = await activeSession(tx, caller, now);
    const identities = await tx
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, user.id));
    const target = identities.find((identity) => identity.provider === provider);
    if (!target) throw identityNotFound();
    if (!user.passwordHash && identities.length === 1) {
      throw new HttpError(
        409,
        'This is your only way to sign in. Set a password first.',
        'LAST_SIGN_IN_METHOD',
      );
    }
    await requireRecentAuth(user, session, currentPassword, now);
    await tx.delete(userIdentities).where(eq(userIdentities.id, target.id));
    return { revoked: await revokeOthers(tx, caller, now) };
  });
}
