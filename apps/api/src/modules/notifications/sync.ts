import {
  BUDGET_WARNING_RATIO,
  daysBetween,
  HOUR_MS,
  nextDueOn,
  type NotificationType,
  priceChange,
  RENEWAL_LEAD_DAYS,
  seriesTiming,
} from '@splinance/shared';
import { and, eq, exists, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  budgets,
  householdMembers,
  households,
  notifications,
  recurringSeries,
} from '../../db/schema';
import { logger } from '../../lib/logger';
import { startPeriodic, withAdvisoryLock } from '../../lib/periodic';
import { budapestToday } from '../../lib/today';
import { listBudgets } from '../budgets/budgets.service';
import { seriesForMember } from '../recurring/recurring.service';

/**
 * State notifications: how things stand, kept in line with the data. `syncNotifications`
 * works out which ones should exist for every member of a household and makes it so:
 * missing ones are added (one row per person and fact, by `dedupe_key`), ones that no
 * longer hold are marked resolved, nothing is deleted. Idempotent, so running it twice, or
 * from two API instances at once, changes nothing more. It runs after the writes that
 * change what is due, and hourly for what changes with the date alone.
 */

/** The state types that resolve on their own; a price change stays as news. */
const RESOLVING: NotificationType[] = [
  'renewal_due',
  'renewal_missed',
  'budget_near',
  'budget_over',
];
/** A price change older than this is history, not news (a first sync after an import). */
const PRICE_NEWS_DAYS = 30;

interface Wanted {
  userId: string;
  type: NotificationType;
  subjectId: string;
  dedupeKey: string;
  dueOn: string | null;
  amount: number | null;
  previousAmount: number | null;
}

/**
 * What should be in each member's bell about the household's recurring payments and income.
 * Income gets no "due soon": money about to arrive needs nothing done. One that did not
 * arrive, or came in a different amount, is news like for a payment.
 */
async function wantedForSeries(
  householdId: string,
  members: { userId: string }[],
  today: string,
): Promise<Wanted[]> {
  const wanted: Wanted[] = [];
  for (const { userId } of members) {
    // What this member sees: the shared series and their own private ones.
    const series = await seriesForMember(db, { householdId, userId }, today);
    for (const item of series) {
      if (!item.remind) continue;
      const next = nextDueOn(item, item.lastPaidOn, today);
      const { timing, daysUntil } = seriesTiming(next, item.cadence, today);
      const fact = { userId, subjectId: item.id, dueOn: next, amount: item.latestAmount };
      if (timing === 'lapsed') {
        wanted.push({
          ...fact,
          type: 'renewal_missed',
          dedupeKey: `renewal_missed:${item.id}:${next}`,
          previousAmount: null,
        });
      } else if (item.kind === 'expense' && daysUntil >= 0 && daysUntil <= RENEWAL_LEAD_DAYS) {
        wanted.push({
          ...fact,
          type: 'renewal_due',
          dedupeKey: `renewal_due:${item.id}:${next}`,
          previousAmount: null,
        });
      }
      const latest = item.payments[0];
      if (
        latest &&
        priceChange(item.latestAmount, item.previousAmount) !== null &&
        daysBetween(latest.occurredOn, today) <= PRICE_NEWS_DAYS
      ) {
        wanted.push({
          ...fact,
          type: 'price_changed',
          dedupeKey: `price_changed:${item.id}:${latest.transactionId}`,
          dueOn: latest.occurredOn,
          previousAmount: item.previousAmount,
        });
      }
    }
  }
  return wanted;
}

/** Household budgets are everyone's: the same facts for every member. */
async function wantedForBudgets(
  householdId: string,
  members: { userId: string }[],
  today: string,
): Promise<Wanted[]> {
  const [first] = members;
  if (!first) return [];
  const month = today.slice(0, 7);
  const list = await listBudgets({ householdId, userId: first.userId }, month);
  const wanted: Wanted[] = [];
  for (const budget of list.budgets) {
    const usage = budget.spent / budget.amount;
    if (usage < BUDGET_WARNING_RATIO) continue;
    const type = usage > 1 ? 'budget_over' : 'budget_near';
    for (const { userId } of members) {
      wanted.push({
        userId,
        type,
        subjectId: budget.categoryId,
        dedupeKey: `${type}:${budget.categoryId}:${month}`,
        dueOn: `${month}-01`,
        amount: budget.spent,
        previousAmount: budget.amount,
      });
    }
  }
  return wanted;
}

export async function syncNotifications(
  householdId: string,
  { now = new Date(), today = budapestToday(now) }: { now?: Date; today?: string } = {},
): Promise<void> {
  const members = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        isNull(householdMembers.leftAt),
        isNull(households.archivedAt),
      ),
    );
  if (members.length === 0) return;

  const wanted = [
    ...(await wantedForSeries(householdId, members, today)),
    ...(await wantedForBudgets(householdId, members, today)),
  ];

  await db.transaction(async (tx) => {
    if (wanted.length > 0) {
      await tx
        .insert(notifications)
        .values(wanted.map((row) => ({ ...row, householdId })))
        // A fact that holds again (a budget over once more, a payment deleted) reopens its
        // resolved row as new and unread; a row that never stopped holding stays as it is,
        // so a read notification does not turn unread on every sync.
        .onConflictDoUpdate({
          target: [notifications.userId, notifications.dedupeKey],
          set: {
            resolvedAt: null,
            readAt: null,
            createdAt: now,
            dueOn: sql`excluded.due_on`,
            amount: sql`excluded.amount`,
            previousAmount: sql`excluded.previous_amount`,
          },
          setWhere: isNotNull(notifications.resolvedAt),
        });
    }
    for (const { userId } of members) {
      const keys = wanted.filter((row) => row.userId === userId).map((row) => row.dedupeKey);
      await tx
        .update(notifications)
        .set({ resolvedAt: now })
        .where(
          and(
            eq(notifications.householdId, householdId),
            eq(notifications.userId, userId),
            inArray(notifications.type, RESOLVING),
            isNull(notifications.resolvedAt),
            keys.length > 0 ? notInArray(notifications.dedupeKey, keys) : undefined,
          ),
        );
    }
  });
}

/** The sync running for each household, and households changed again while it ran. */
const running = new Map<string, Promise<void>>();
const changedMeanwhile = new Set<string>();

/**
 * After a write that can change what is due (a payment, a series, a budget): brings the
 * household's notifications up to date. Routes wait for it only briefly (`syncAfterWrite`).
 * One sync per household at a time: writes arriving while one runs mark the household,
 * and it runs once more afterwards, so a burst of writes costs at most two syncs. A
 * failure is logged and never fails anything (the hourly sweep catches up).
 */
export function syncAfterChange(householdId: string): Promise<void> {
  const current = running.get(householdId);
  if (current) {
    changedMeanwhile.add(householdId);
    return current;
  }
  const run = (async () => {
    do {
      changedMeanwhile.delete(householdId);
      try {
        await syncNotifications(householdId);
      } catch (err) {
        logger.error({ err, householdId }, 'Notification sync failed');
      }
    } while (changedMeanwhile.has(householdId));
  })().finally(() => running.delete(householdId));
  running.set(householdId, run);
  return run;
}

/** How long a route waits for the sync its write started (see `syncAfterWrite`). */
const SYNC_WAIT_MS = 1_000;

/**
 * For routes, after the write committed: waits for the household's sync up to
 * SYNC_WAIT_MS, so the bell the web refetches right after a write already shows what the
 * write caused, but a slow or blocked sync never holds the request longer; it then
 * finishes in the background.
 */
export async function syncAfterWrite(householdId: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SYNC_WAIT_MS);
  });
  await Promise.race([syncAfterChange(householdId), waited]);
  clearTimeout(timer);
}

/** Waits for every sync started by `syncAfterChange` (shutdown, tests). */
export async function drainSyncs(): Promise<void> {
  while (running.size > 0) await Promise.all(running.values());
}

export const NOTIFICATION_SWEEP_LOCK = 'splinance:notification-sweep';

/**
 * Every household with something to remind about (a live series, or a budget), synced one
 * after the other under one advisory lock, so a due date that comes near without any write
 * still notifies. Null when another instance is sweeping; otherwise how many it synced.
 */
export async function runNotificationSweep(now = new Date()): Promise<number | null> {
  return withAdvisoryLock(NOTIFICATION_SWEEP_LOCK, async () => {
    const liveSeries = db
      .select({ one: sql`1` })
      .from(recurringSeries)
      .where(
        and(
          eq(recurringSeries.householdId, households.id),
          eq(recurringSeries.status, 'active'),
          isNull(recurringSeries.archivedAt),
        ),
      );
    const anyBudget = db
      .select({ one: sql`1` })
      .from(budgets)
      .where(eq(budgets.householdId, households.id));
    const rows = await db
      .select({ id: households.id })
      .from(households)
      .where(and(isNull(households.archivedAt), or(exists(liveSeries), exists(anyBudget))));
    for (const { id } of rows) {
      try {
        await syncNotifications(id, { now });
      } catch (err) {
        logger.error({ err, householdId: id }, 'Notification sync failed');
      }
    }
    return rows.length;
  });
}

/** At boot and then hourly, in every instance (the lock keeps runs apart). */
export function startNotificationSweep(intervalMs = HOUR_MS): () => void {
  return startPeriodic('notification-sweep', intervalMs, async () => {
    await runNotificationSweep();
  });
}
