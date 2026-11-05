import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/db';
import { createHousehold } from '../../../test/households';
import { createTestUser, type TestUser } from '../../../test/users';
import { createApp } from '../../app';
import { db, pool } from '../../db/client';
import { householdInvites, sessions } from '../../db/schema';
import {
  deleteStaleInvites,
  deleteStaleSessions,
  MAINTENANCE_LOCK,
  REVOKED_SESSION_DAYS,
  runMaintenance,
  STALE_INVITE_DAYS,
} from './maintenance.service';

const NOW = new Date('2026-11-03T12:00:00Z');
const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

let anna: TestUser;

beforeEach(async () => {
  await resetDatabase();
  anna = await createTestUser('Anna');
});

async function session(name: string, values: { expiresAt: Date; revokedAt?: Date }) {
  await db
    .insert(sessions)
    .values({ userId: anna.id, tokenHash: `${name}-${randomUUID()}`, ...values });
  return name;
}

const remainingSessions = async () =>
  (await db.select({ tokenHash: sessions.tokenHash }).from(sessions))
    .map((s) => s.tokenHash.split('-')[0])
    .sort();

describe('deleteStaleSessions', () => {
  it('deletes expired sessions and ones revoked over a week ago', async () => {
    await session('active', { expiresAt: daysFromNow(10) });
    await session('expired', { expiresAt: daysFromNow(-1) });
    await session('revokedRecently', { expiresAt: daysFromNow(10), revokedAt: daysFromNow(-1) });
    await session('revokedLongAgo', {
      expiresAt: daysFromNow(10),
      revokedAt: daysFromNow(-REVOKED_SESSION_DAYS - 1),
    });

    expect(await deleteStaleSessions(NOW)).toBe(2);
    expect(await remainingSessions()).toEqual(['active', 'revokedRecently']);
    // Nothing left to do: a second run deletes nothing.
    expect(await deleteStaleSessions(NOW)).toBe(0);
  });
});

describe('deleteStaleInvites', () => {
  it('deletes unused invites a month after they expired or were revoked, never accepted ones', async () => {
    const householdId = await createHousehold(createApp(), anna);
    const ben = await createTestUser('Ben');
    const old = daysFromNow(-STALE_INVITE_DAYS - 1);
    const invite = (name: string, values: Partial<typeof householdInvites.$inferInsert>) =>
      db.insert(householdInvites).values({
        householdId,
        tokenHash: `${name}-${randomUUID()}`,
        createdBy: anna.id,
        expiresAt: daysFromNow(7),
        ...values,
      });

    await invite('pending', {});
    await invite('expiredRecently', { expiresAt: daysFromNow(-1) });
    await invite('expiredLongAgo', { expiresAt: old });
    await invite('revokedLongAgo', { revokedAt: old });
    // Accepted invites are membership history: kept even when long expired.
    await db.insert(householdInvites).values({
      householdId,
      tokenHash: `accepted-${randomUUID()}`,
      createdBy: anna.id,
      expiresAt: old,
      ...(await joinAs(householdId, ben)),
    });

    expect(await deleteStaleInvites(NOW)).toBe(2);
    const left = (await db.select({ tokenHash: householdInvites.tokenHash }).from(householdInvites))
      .map((i) => i.tokenHash.split('-')[0])
      .sort();
    expect(left).toEqual(['accepted', 'expiredRecently', 'pending']);
  });
});

/** Ben as a member, so an invite can name him as its accepter (composite foreign key). */
async function joinAs(householdId: string, user: TestUser) {
  await pool.query(
    "insert into household_members (household_id, user_id, role) values ($1, $2, 'member')",
    [householdId, user.id],
  );
  return { acceptedBy: user.id, acceptedAt: daysFromNow(-STALE_INVITE_DAYS - 2) };
}

describe('runMaintenance', () => {
  it('cleans both and skips the run while another instance holds the lock', async () => {
    await session('expired', { expiresAt: daysFromNow(-1) });

    const other = await pool.connect();
    try {
      await other.query('select pg_advisory_lock(hashtext($1))', [MAINTENANCE_LOCK]);
      expect(await runMaintenance(NOW)).toBeNull();
      await other.query('select pg_advisory_unlock(hashtext($1))', [MAINTENANCE_LOCK]);
    } finally {
      other.release();
    }

    expect(await runMaintenance(NOW)).toEqual({ sessions: 1, invites: 0, notifications: 0 });
  });
});
