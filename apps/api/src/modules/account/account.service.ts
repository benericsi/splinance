import {
  type AccountResponse,
  type ChangePasswordInput,
  requiredPasswordIssues,
  type UpdateProfileInput,
  type User,
} from '@splinance/shared';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { sessions, type SessionRow, userIdentities, users, type UserRow } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { toUser } from '../auth/auth.service';
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

/** The caller's session, if it is still active (an access token outlives a logout). */
async function activeSession(executor: Db, caller: Caller, now: Date): Promise<SessionRow> {
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
  if (!session || session.expiresAt <= now) throw sessionEnded();
  return session;
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
  if (now.getTime() - session.createdAt.getTime() > RECENT_SIGN_IN_MS) throw reauthRequired();
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
  userId: string,
  providerIds: readonly string[],
): Promise<AccountResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw sessionEnded();
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
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ displayName: input.displayName })
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
