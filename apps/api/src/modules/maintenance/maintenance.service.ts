import { and, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { householdInvites, notifications, sessions } from '../../db/schema';
import { logger } from '../../lib/logger';
import { startPeriodic, withAdvisoryLock } from '../../lib/periodic';

/** Held for the duration of a run, so two API instances never run one together. */
export const MAINTENANCE_LOCK = 'splinance:maintenance';
const DAY_MS = 86_400_000;
/** Revoked sessions are kept this long (who was signed out, and when), then deleted. */
export const REVOKED_SESSION_DAYS = 7;
/** Unused invites are kept this long after they expired or were revoked. */
export const STALE_INVITE_DAYS = 30;
/** Rows per delete statement: short statements, short locks. */
const BATCH = 1000;

/** Read notifications are kept this long, any notification at most `OLD_NOTIFICATION_DAYS`. */
export const READ_NOTIFICATION_DAYS = 90;
export const OLD_NOTIFICATION_DAYS = 180;

export interface MaintenanceResult {
  sessions: number;
  invites: number;
  notifications: number;
}

/**
 * Sessions nobody can use anymore: expired, or revoked more than a week ago. A refresh token
 * of an expired session is refused anyway; nothing references sessions.
 */
export async function deleteStaleSessions(now = new Date()): Promise<number> {
  const revokedBefore = new Date(now.getTime() - REVOKED_SESSION_DAYS * DAY_MS);
  const stale = or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, revokedBefore));
  return deleteInBatches(async () => {
    const batch = db.select({ id: sessions.id }).from(sessions).where(stale).limit(BATCH);
    const result = await db.delete(sessions).where(inArray(sessions.id, batch));
    return result.rowCount ?? 0;
  });
}

/**
 * Invites that were never accepted and expired or were revoked over a month ago. Accepted
 * ones stay: they record who joined through whose link. Nothing references invites.
 */
export async function deleteStaleInvites(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - STALE_INVITE_DAYS * DAY_MS);
  const stale = and(
    isNull(householdInvites.acceptedAt),
    or(lt(householdInvites.expiresAt, before), lt(householdInvites.revokedAt, before)),
  );
  return deleteInBatches(async () => {
    const batch = db
      .select({ id: householdInvites.id })
      .from(householdInvites)
      .where(stale)
      .limit(BATCH);
    const result = await db.delete(householdInvites).where(inArray(householdInvites.id, batch));
    return result.rowCount ?? 0;
  });
}

/** Notifications read three months ago, and any older than half a year. Nothing refers to them. */
export async function deleteOldNotifications(now = new Date()): Promise<number> {
  const readBefore = new Date(now.getTime() - READ_NOTIFICATION_DAYS * DAY_MS);
  const createdBefore = new Date(now.getTime() - OLD_NOTIFICATION_DAYS * DAY_MS);
  const old = or(lt(notifications.readAt, readBefore), lt(notifications.createdAt, createdBefore));
  return deleteInBatches(async () => {
    const batch = db.select({ id: notifications.id }).from(notifications).where(old).limit(BATCH);
    const result = await db.delete(notifications).where(inArray(notifications.id, batch));
    return result.rowCount ?? 0;
  });
}

/**
 * One maintenance run; null when another instance is running one right now. Plain functions,
 * so a BullMQ job (Phase 6) can call them unchanged.
 */
export async function runMaintenance(now = new Date()): Promise<MaintenanceResult | null> {
  return withAdvisoryLock(MAINTENANCE_LOCK, async () => ({
    sessions: await deleteStaleSessions(now),
    invites: await deleteStaleInvites(now),
    notifications: await deleteOldNotifications(now),
  }));
}

/** At boot and then daily, in every instance (the lock keeps runs apart). */
export function startMaintenance(intervalMs = DAY_MS): () => void {
  return startPeriodic('maintenance', intervalMs, async () => {
    const result = await runMaintenance();
    if (result && (result.sessions > 0 || result.invites > 0 || result.notifications > 0)) {
      logger.info(result, 'Stale sessions, invites and notifications deleted');
    }
  });
}

async function deleteInBatches(deleteBatch: () => Promise<number>): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await deleteBatch();
    total += deleted;
    if (deleted < BATCH) return total;
  }
}
