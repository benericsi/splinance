import type { LoginInput, RegisterInput, User } from '@splinance/shared';
import { and, eq, isNull, or } from 'drizzle-orm';
import { env } from '../../config/env';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import { sessions, users, type UserRow } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { generateToken, hashToken } from '../../lib/random-token';
import { logger } from '../../lib/logger';
import { hashPassword, verifyDummyPassword, verifyPassword } from './passwords';
import { signAccessToken } from './tokens';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A previous refresh token is still accepted for this long after rotation.
 * Covers parallel refreshes from several tabs, which share one cookie jar.
 */
export const REUSE_GRACE_MS = 10_000;

export interface RefreshCookie {
  token: string;
  expiresAt: Date;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  /** null when the browser already holds the latest refresh cookie (grace window). */
  refreshCookie: RefreshCookie | null;
}

const invalidCredentials = () =>
  new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

const invalidRefreshToken = () =>
  new HttpError(401, 'Session expired, please log in again', 'INVALID_REFRESH_TOKEN');

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

function refreshExpiry(now: Date): Date {
  // Sliding expiry: every rotation extends the session.
  return new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
}

async function createSession(executor: Db, user: UserRow): Promise<AuthResult> {
  const now = new Date();
  const refreshToken = generateToken();
  const expiresAt = refreshExpiry(now);

  const [session] = await executor
    .insert(sessions)
    .values({ userId: user.id, tokenHash: hashToken(refreshToken), rotatedAt: now, expiresAt })
    .returning({ id: sessions.id });
  if (!session) throw new Error('Session insert returned no row');

  return {
    user: toUser(user),
    accessToken: await signAccessToken({ userId: user.id, sessionId: session.id }),
    refreshCookie: { token: refreshToken, expiresAt },
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, displayName: input.displayName })
        .returning();
      if (!user) throw new Error('User insert returned no row');
      return createSession(tx, user);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'users_email_unique')) {
      throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email));

  if (!user) {
    await verifyDummyPassword(input.password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw invalidCredentials();
  }

  return createSession(db, user);
}

type RefreshOutcome = { kind: 'ok'; result: AuthResult } | { kind: 'invalid' } | { kind: 'reuse' };

export async function refresh(rawToken: string): Promise<AuthResult> {
  const tokenHash = hashToken(rawToken);

  // Decide inside the transaction, throw after it: a revoke on reuse must commit, not roll back.
  const outcome = await db.transaction(async (tx): Promise<RefreshOutcome> => {
    const now = new Date();

    const [current] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .for('update');

    if (current) {
      if (current.revokedAt || current.expiresAt <= now) return { kind: 'invalid' };

      const nextToken = generateToken();
      const expiresAt = refreshExpiry(now);
      await tx
        .update(sessions)
        .set({
          tokenHash: hashToken(nextToken),
          previousTokenHash: tokenHash,
          rotatedAt: now,
          expiresAt,
        })
        .where(eq(sessions.id, current.id));

      return {
        kind: 'ok',
        result: await sessionResult(tx, current.userId, current.id, {
          token: nextToken,
          expiresAt,
        }),
      };
    }

    const [previous] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.previousTokenHash, tokenHash))
      .for('update');

    if (!previous || previous.revokedAt || previous.expiresAt <= now) return { kind: 'invalid' };

    if (now.getTime() - previous.rotatedAt.getTime() <= REUSE_GRACE_MS) {
      // Another tab already rotated this token; its cookie is already in the shared jar.
      return { kind: 'ok', result: await sessionResult(tx, previous.userId, previous.id, null) };
    }

    // An already-rotated token came back after the grace window: treat it as stolen.
    await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, previous.id));
    logger.warn(
      { sessionId: previous.id, userId: previous.userId },
      'Refresh token reuse detected, session revoked',
    );
    return { kind: 'reuse' };
  });

  if (outcome.kind !== 'ok') throw invalidRefreshToken();
  return outcome.result;
}

async function sessionResult(
  executor: Db,
  userId: string,
  sessionId: string,
  refreshCookie: RefreshCookie | null,
): Promise<AuthResult> {
  const [user] = await executor.select().from(users).where(eq(users.id, userId));
  if (!user) throw invalidRefreshToken();
  return {
    user: toUser(user),
    accessToken: await signAccessToken({ userId, sessionId }),
    refreshCookie,
  };
}

/** Idempotent: unknown or already revoked tokens are ignored. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        or(eq(sessions.tokenHash, tokenHash), eq(sessions.previousTokenHash, tokenHash)),
        isNull(sessions.revokedAt),
      ),
    );
}

export async function getUser(userId: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
  return toUser(user);
}
