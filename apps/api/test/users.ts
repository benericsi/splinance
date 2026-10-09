import { randomUUID } from 'node:crypto';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { signAccessToken } from '../src/modules/auth/tokens';

export interface TestUser {
  id: string;
  displayName: string;
}

/**
 * Inserts a user directly: no Argon2 hashing and no register rate limit, so permission
 * tests can create many users quickly. Not usable for login (the hash is fake).
 */
export async function createTestUser(displayName: string): Promise<TestUser> {
  const [user] = await db
    .insert(users)
    .values({
      email: `${displayName.toLowerCase()}-${randomUUID()}@example.com`,
      passwordHash: 'not-a-real-hash',
      displayName,
    })
    .returning();
  if (!user) throw new Error('User insert returned no row');
  return { id: user.id, displayName };
}

/**
 * A fresh access token for the user. Signed at call time, so it stays valid after
 * tests move the fake clock forward. requireAuth does not look up the session.
 */
export async function bearer(user: TestUser): Promise<string> {
  return `Bearer ${await signAccessToken({ userId: user.id, sessionId: randomUUID() })}`;
}

/** The driver error behind a Drizzle query error (Drizzle wraps it in `cause`). */
export async function pgErrorOf(
  promise: Promise<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (err) {
    const cause = err instanceof Error && err.cause ? err.cause : err;
    return cause as { code?: string; constraint?: string };
  }
  throw new Error('Expected the query to fail');
}
