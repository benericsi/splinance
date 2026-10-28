import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { buildDemoStory, DEMO_PEOPLE } from '@splinance/shared';
import { count, eq, gt, inArray, sql } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import {
  auditLog,
  budgets,
  categories,
  categoryRules,
  demos,
  householdInvites,
  householdMembers,
  households,
  importBatches,
  settlements,
  transactionSplits,
  transactions,
  type UserRow,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { type AuthResult, createSession } from '../auth/auth.service';
import { hashPassword } from '../auth/passwords';
import { seedDemo } from './demo.seed';
import { budapestToday } from './today';

export interface DemoConfig {
  /** Days until a sandbox and everything in it is deleted. */
  ttlDays: number;
  /** Sandboxes that may exist at once (unexpired ones). */
  maxActive: number;
}

export interface Sandbox {
  demoId: string;
  householdId: string;
  seed: number;
  /** The day the story ends on. */
  today: string;
  expiresAt: Date;
  visitor: UserRow;
}

export interface DemoCreated extends AuthResult {
  householdId: string;
  expiresAt: Date;
}

/** A reserved top-level domain (RFC 2606): these addresses can never receive mail. */
export const DEMO_EMAIL_DOMAIN = 'demo.invalid';

const DAY_MS = 86_400_000;
/** Serializes "count the active demos, then add one", so parallel requests cannot overshoot the cap. */
const CREATE_LOCK = 'splinance:demo-create';

export const demoNotFound = () =>
  new HttpError(404, 'This account is not a demo', 'DEMO_NOT_FOUND');

/**
 * Sandboxes are created and hard-deleted only in a demo (or test) database. The env check
 * looks at the configured URL; this asks the server which database the pool really reached.
 */
export async function assertDemoDatabase(executor: Db): Promise<void> {
  const result = await executor.execute<{ name: string }>(sql`select current_database() as name`);
  const name = result.rows[0]?.name ?? '';
  if (!/_(demo|test)$/.test(name)) {
    throw new Error(`Demo sandboxes are refused on the database "${name}"`);
  }
}

/**
 * Creates a sandbox: the visitor and a made-up partner (accounts nobody can log in to:
 * the password is random and thrown away) and a household seeded with the demo story for
 * the last 12 months. A failure on the way deletes what was made.
 */
export async function createSandbox(
  config: DemoConfig,
  options: { today?: string; seed?: number } = {},
): Promise<Sandbox> {
  const started = Date.now();
  await assertDemoDatabase(db);
  const today = options.today ?? budapestToday();
  const seed = options.seed ?? randomInt(0, 2 ** 31 - 1);
  const story = buildDemoStory({ seed, today });
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
  const expiresAt = new Date(Date.now() + config.ttlDays * DAY_MS);

  const { demo, visitor } = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CREATE_LOCK}))`);
    const [active] = await tx
      .select({ count: count() })
      .from(demos)
      .where(gt(demos.expiresAt, new Date()));
    if ((active?.count ?? 0) >= config.maxActive) {
      throw new HttpError(
        503,
        'The demo is full right now. Please try again later',
        'DEMO_CAPACITY',
      );
    }

    const key = randomUUID();
    const person = async (email: string, displayName: string) => {
      const [row] = await tx.insert(users).values({ email, passwordHash, displayName }).returning();
      if (!row) throw new Error('User insert returned no row');
      return row;
    };
    const visitor = await person(`demo-${key}@${DEMO_EMAIL_DOMAIN}`, DEMO_PEOPLE.you.displayName);
    const partner = await person(
      `demo-${key}-partner@${DEMO_EMAIL_DOMAIN}`,
      DEMO_PEOPLE.partner.displayName,
    );
    const [demo] = await tx
      .insert(demos)
      .values({ userId: visitor.id, partnerId: partner.id, seed, anchorOn: today, expiresAt })
      .returning();
    if (!demo) throw new Error('Demo insert returned no row');
    return { demo, visitor };
  });

  try {
    const householdId = await seedDemo(story, { you: demo.userId, partner: demo.partnerId });
    await db.update(demos).set({ householdId }).where(eq(demos.id, demo.id));
    logger.info({ demoId: demo.id, ms: Date.now() - started }, 'Demo created');
    return { demoId: demo.id, householdId, seed, today, expiresAt, visitor };
  } catch (error) {
    // Half a household is no demo: remove what was made, then report the original failure.
    await deleteQuietly(demo.id);
    throw error;
  }
}

/** A sandbox for a visitor of the demo site, signed in. */
export async function createDemo(
  config: DemoConfig,
  options: { today?: string; seed?: number } = {},
): Promise<DemoCreated> {
  const sandbox = await createSandbox(config, options);
  try {
    const session = await createSession(db, sandbox.visitor);
    return { ...session, householdId: sandbox.householdId, expiresAt: sandbox.expiresAt };
  } catch (error) {
    await deleteQuietly(sandbox.demoId);
    throw error;
  }
}

async function deleteQuietly(demoId: string): Promise<void> {
  await deleteDemo(demoId).catch((cleanupError: unknown) => {
    logger.error({ err: cleanupError, demoId }, 'Could not delete a failed demo');
  });
}

/** The caller's sandbox, for the banner; 404 for accounts that are not demos. */
export async function getDemo(userId: string): Promise<{ expiresAt: Date }> {
  const [demo] = await db
    .select({ expiresAt: demos.expiresAt })
    .from(demos)
    .where(eq(demos.userId, userId));
  if (!demo) throw demoNotFound();
  return demo;
}

/** "Start over" and "End demo": the visitor deletes their own sandbox. */
export async function endDemo(userId: string): Promise<void> {
  const [demo] = await db.select({ id: demos.id }).from(demos).where(eq(demos.userId, userId));
  if (!demo) throw demoNotFound();
  await deleteDemo(demo.id);
}

/**
 * Deletes a sandbox for good, in one transaction: every household either person belongs to
 * (the seeded one and any the visitor made) with all their rows, then both accounts (their
 * sessions cascade). The one place rows are hard-deleted; every foreign key is ON DELETE
 * NO ACTION, so children go before parents. Returns false if the demo is gone already.
 */
export async function deleteDemo(demoId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await assertDemoDatabase(tx);
    const [demo] = await tx.select().from(demos).where(eq(demos.id, demoId)).for('update');
    if (!demo) return false;

    const people = [demo.userId, demo.partnerId];
    const memberships = await tx
      .selectDistinct({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(inArray(householdMembers.userId, people));
    const householdIds = [
      ...new Set([
        ...memberships.map((m) => m.householdId),
        ...(demo.householdId ? [demo.householdId] : []),
      ]),
    ];

    if (householdIds.length > 0) {
      // Waits for writes still running in them (they hold the shared household lock).
      await tx
        .select({ id: households.id })
        .from(households)
        .where(inArray(households.id, householdIds))
        .orderBy(households.id)
        .for('update');
      for (const table of [
        auditLog,
        transactionSplits,
        transactions,
        importBatches,
        settlements,
        budgets,
        categoryRules,
        householdInvites,
        categories,
        householdMembers,
      ]) {
        await tx.delete(table).where(inArray(table.householdId, householdIds));
      }
    }
    await tx.delete(demos).where(eq(demos.id, demo.id));
    if (householdIds.length > 0) {
      await tx.delete(households).where(inArray(households.id, householdIds));
    }
    await tx.delete(users).where(inArray(users.id, people));
    return true;
  });
}
