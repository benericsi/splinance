import {
  type MarkNotificationsReadInput,
  type Notification,
  NOTIFICATION_LIST_LIMIT,
  type NotificationListResponse,
  type NotificationSettings,
} from '@splinance/shared';
import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Db } from '../../db/client';
import {
  categories,
  householdMembers,
  households,
  importBatches,
  notifications,
  type NotificationRow,
  recurringSeries,
  settlements,
  transactions,
  users,
} from '../../db/schema';
import { requireMembership } from '../households/households.service';
import type { HouseholdScope } from '../transactions/transactions.service';

/**
 * Reading the bell: the person's notifications in households they are still an active
 * member of (and that are not archived), newest first. Names come from the current data,
 * through the same visibility rules as the rest of the app; a row whose subject is gone or
 * hidden from the reader is left out.
 */

const actors = alias(users, 'actors');

/** The reader's live rows: their own, in households they are still in. */
function liveFor(userId: string) {
  return and(
    eq(notifications.userId, userId),
    isNull(households.archivedAt),
    isNull(householdMembers.leftAt),
  );
}

async function unreadCount(executor: Db, userId: string): Promise<number> {
  const [row] = await executor
    .select({ n: count() })
    .from(notifications)
    .innerJoin(households, eq(households.id, notifications.householdId))
    .innerJoin(
      householdMembers,
      and(
        eq(householdMembers.householdId, notifications.householdId),
        eq(householdMembers.userId, notifications.userId),
      ),
    )
    .where(and(liveFor(userId), isNull(notifications.readAt), isNull(notifications.resolvedAt)));
  return row?.n ?? 0;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return unreadCount(db, userId);
}

const SERIES_TYPES = new Set(['renewal_due', 'renewal_missed', 'price_changed']);
const BUDGET_TYPES = new Set(['budget_near', 'budget_over']);
const TRANSACTION_TYPES = new Set(['tx_added', 'tx_changed', 'tx_deleted']);

const idsOf = (rows: NotificationRow[], types: Set<string>) => [
  ...new Set(rows.filter((row) => types.has(row.type)).map((row) => row.subjectId)),
];

/** Names (or existence) of the rows' subjects, as the reader may see them. */
async function subjects(userId: string, rows: NotificationRow[]) {
  const seriesIds = idsOf(rows, SERIES_TYPES);
  const categoryIds = idsOf(rows, BUDGET_TYPES);
  const transactionIds = idsOf(rows, TRANSACTION_TYPES);
  const batchIds = idsOf(rows, new Set(['import_added']));
  const settlementIds = idsOf(rows, new Set(['settlement_recorded']));
  const from = alias(users, 'from_user');
  const to = alias(users, 'to_user');

  const [series, cats, txs, batches, pays] = await Promise.all([
    seriesIds.length === 0
      ? []
      : db
          .select({ id: recurringSeries.id, name: recurringSeries.name })
          .from(recurringSeries)
          .where(
            and(
              inArray(recurringSeries.id, seriesIds),
              or(isNull(recurringSeries.userId), eq(recurringSeries.userId, userId)),
            ),
          ),
    categoryIds.length === 0
      ? []
      : db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(inArray(categories.id, categoryIds)),
    transactionIds.length === 0
      ? []
      : db
          .select({ id: transactions.id, name: transactions.description })
          .from(transactions)
          .where(
            and(
              inArray(transactions.id, transactionIds),
              or(eq(transactions.visibility, 'shared'), eq(transactions.createdBy, userId)),
            ),
          ),
    batchIds.length === 0
      ? []
      : db
          .select({ id: importBatches.id })
          .from(importBatches)
          .where(inArray(importBatches.id, batchIds)),
    settlementIds.length === 0
      ? []
      : db
          .select({
            id: settlements.id,
            fromId: settlements.fromUserId,
            fromName: from.displayName,
            toId: settlements.toUserId,
            toName: to.displayName,
          })
          .from(settlements)
          .innerJoin(from, eq(from.id, settlements.fromUserId))
          .innerJoin(to, eq(to.id, settlements.toUserId))
          .where(inArray(settlements.id, settlementIds)),
  ]);

  const names = new Map<string, string | null>([
    ...series.map((row) => [row.id, row.name] as const),
    ...cats.map((row) => [row.id, row.name] as const),
    ...txs.map((row) => [row.id, row.name] as const),
    ...batches.map((row) => [row.id, null] as const),
    ...pays.map((row) => [row.id, null] as const),
  ]);
  const parties = new Map(
    pays.map((row) => [
      row.id,
      {
        from: { userId: row.fromId, displayName: row.fromName },
        to: { userId: row.toId, displayName: row.toName },
      },
    ]),
  );
  return { names, parties };
}

export async function listNotifications(userId: string): Promise<NotificationListResponse> {
  const rows = await db
    .select({
      notification: notifications,
      householdName: households.name,
      currency: households.baseCurrency,
      actorName: actors.displayName,
    })
    .from(notifications)
    .innerJoin(households, eq(households.id, notifications.householdId))
    .innerJoin(
      householdMembers,
      and(
        eq(householdMembers.householdId, notifications.householdId),
        eq(householdMembers.userId, notifications.userId),
      ),
    )
    .leftJoin(actors, eq(actors.id, notifications.actorId))
    .where(liveFor(userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(NOTIFICATION_LIST_LIMIT);

  const { names, parties } = await subjects(
    userId,
    rows.map((row) => row.notification),
  );
  const list: Notification[] = rows.flatMap(
    ({ notification: n, householdName, currency, actorName }) => {
      if (!names.has(n.subjectId)) return [];
      return [
        {
          id: n.id,
          householdId: n.householdId,
          householdName,
          type: n.type,
          action: n.action,
          actor:
            n.actorId && actorName !== null ? { userId: n.actorId, displayName: actorName } : null,
          subjectId: n.subjectId,
          subjectName: names.get(n.subjectId) ?? null,
          parties: parties.get(n.subjectId) ?? null,
          dueOn: n.dueOn,
          amount: n.amount,
          previousAmount: n.previousAmount,
          count: n.count,
          currency,
          createdAt: n.createdAt.toISOString(),
          readAt: n.readAt?.toISOString() ?? null,
          resolvedAt: n.resolvedAt?.toISOString() ?? null,
        },
      ];
    },
  );
  return { notifications: list, unread: await unreadCount(db, userId) };
}

/** Opening an item marks it read; "Mark all as read" does all of the reader's. */
export async function markRead(userId: string, input: MarkNotificationsReadInput): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        'ids' in input ? inArray(notifications.id, input.ids) : undefined,
      ),
    );
}

export async function getNotificationSettings(
  scope: HouseholdScope,
): Promise<NotificationSettings> {
  await requireMembership(db, scope);
  const [row] = await db
    .select({ activity: householdMembers.notifyActivity })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, scope.householdId),
        eq(householdMembers.userId, scope.userId),
      ),
    );
  return { activity: row?.activity ?? true };
}

/** Turning activity off also clears what is unread of it in this household. */
export async function setNotificationSettings(
  scope: HouseholdScope,
  settings: NotificationSettings,
): Promise<void> {
  await db.transaction(async (tx) => {
    await requireMembership(tx, scope);
    await tx
      .update(householdMembers)
      .set({ notifyActivity: settings.activity })
      .where(
        and(
          eq(householdMembers.householdId, scope.householdId),
          eq(householdMembers.userId, scope.userId),
        ),
      );
    if (!settings.activity) {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.householdId, scope.householdId),
            eq(notifications.userId, scope.userId),
            isNull(notifications.readAt),
            inArray(notifications.type, [
              'tx_added',
              'tx_changed',
              'tx_deleted',
              'import_added',
              'settlement_recorded',
            ]),
          ),
        );
    }
  });
}
