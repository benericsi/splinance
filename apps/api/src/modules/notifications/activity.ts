import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  AuditAction,
  NotificationAction,
  NotificationType,
  Settlement,
  Transaction,
} from '@splinance/shared';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { householdMembers, notifications } from '../../db/schema';
import type { HouseholdScope } from '../transactions/transactions.service';

/**
 * Activity notifications: what someone else did to money you are part of. Written in the
 * same database transaction as the change (from the audit hooks), so a change never exists
 * without its notification and a rolled-back one leaves none.
 *
 * A context changes how transaction activity is written for a stretch of code:
 * `withoutActivity` writes none (seeding the demo's history), `collectingActivity` gathers
 * it, so an import writes one row per person ("imported 23 transactions") instead of one
 * per transaction.
 */

interface Collected {
  count: number;
  share: number;
}

type ActivityMode = { mode: 'silent' } | { mode: 'collect'; people: Map<string, Collected> };

const context = new AsyncLocalStorage<ActivityMode>();

export function withoutActivity<T>(work: () => Promise<T>): Promise<T> {
  return context.run({ mode: 'silent' }, work);
}

/** Runs `work`, gathering the transaction activity it would have written, per person. */
export async function collectingActivity<T>(
  work: () => Promise<T>,
): Promise<{ result: T; people: Map<string, Collected> }> {
  const people = new Map<string, Collected>();
  const result = await context.run({ mode: 'collect', people }, work);
  return { result, people };
}

const isSilent = () => context.getStore()?.mode === 'silent';

/** Members who still hear about others' changes in this household. */
async function listeners(tx: Db, householdId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        isNull(householdMembers.leftAt),
        eq(householdMembers.notifyActivity, true),
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

interface ActivityRow {
  userId: string;
  type: NotificationType;
  action: NotificationAction;
  subjectId: string;
  amount: number | null;
  previousAmount?: number | null;
  count?: number | null;
}

/**
 * Writes activity rows, folding each into the person's unread row about the same subject:
 * Jane fixing an expense three times is one item. An unread "added" stays "added" when it
 * is then edited (with the new share); an unread "changed" keeps the share it started from.
 */
async function writeActivity(tx: Db, scope: HouseholdScope, rows: ActivityRow[]) {
  if (rows.length === 0) return;
  const t = notifications;
  await tx
    .insert(t)
    .values(
      rows.map((row) => ({
        userId: row.userId,
        householdId: scope.householdId,
        type: row.type,
        action: row.action,
        actorId: scope.userId,
        subjectId: row.subjectId,
        amount: row.amount,
        previousAmount: row.previousAmount ?? null,
        count: row.count ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [t.userId, t.subjectId],
      targetWhere: sql`${t.readAt} is null and ${t.type} in ('tx_added', 'tx_changed', 'tx_deleted', 'import_added', 'settlement_recorded')`,
      set: {
        type: sql`case when ${t.type} = 'tx_added' and excluded.type = 'tx_changed' then ${t.type} else excluded.type end`,
        action: sql`case when ${t.type} = 'tx_added' and excluded.type = 'tx_changed' then ${t.action} else excluded.action end`,
        previousAmount: sql`case when ${t.type} = 'tx_changed' and excluded.type = 'tx_changed' then ${t.previousAmount} when ${t.type} = 'tx_added' and excluded.type = 'tx_changed' then null else excluded.previous_amount end`,
        amount: sql`excluded.amount`,
        count: sql`excluded.count`,
        actorId: sql`excluded.actor_id`,
        createdAt: sql`now()`,
        resolvedAt: sql`null`,
      },
    });
}

/**
 * A person's part in a shared transaction: their share, or 0 when they paid without a
 * share; undefined when they are not in it. Private transactions involve nobody else.
 */
function partOf(transaction: Transaction | null, userId: string): number | undefined {
  if (!transaction || transaction.visibility !== 'shared') return undefined;
  const share = transaction.split?.shares.find((s) => s.userId === userId)?.amount;
  if (share !== undefined && share > 0) return share;
  return transaction.paidBy.userId === userId ? (share ?? 0) : undefined;
}

function peopleIn(transaction: Transaction | null): string[] {
  if (!transaction || transaction.visibility !== 'shared') return [];
  return [
    transaction.paidBy.userId,
    ...(transaction.split?.shares.filter((s) => s.amount > 0).map((s) => s.userId) ?? []),
  ];
}

/**
 * From a transaction's audit entry: notifies each other person who is in it (or was, for
 * an edit or delete) when it was added, deleted or restored, or when an edit changed their
 * share or the payer. A description or category edit notifies nobody. A shared transaction
 * made private disappears for the others, and so do their unread notifications about it.
 */
export async function recordTransactionActivity(
  tx: Db,
  scope: HouseholdScope,
  action: AuditAction,
  before: Transaction | null,
  after: Transaction | null,
): Promise<void> {
  if (isSilent()) return;
  const subject = (after ?? before)?.id;
  if (!subject) return;

  if (before?.visibility === 'shared' && after?.visibility === 'private') {
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.subjectId, subject),
          isNull(notifications.readAt),
          ne(notifications.userId, scope.userId),
        ),
      );
    return;
  }

  const people = new Set([...peopleIn(before), ...peopleIn(after)]);
  people.delete(scope.userId);
  if (people.size === 0) return;
  const listening = await listeners(tx, scope.householdId);

  const store = context.getStore();
  const rows: ActivityRow[] = [];
  for (const userId of people) {
    if (!listening.has(userId)) continue;
    const was = partOf(before, userId);
    const is = partOf(after, userId);
    if (store?.mode === 'collect') {
      // An import adds (its part after), its undo deletes (its part before).
      const part = is ?? was;
      if (part === undefined) continue;
      const collected = store.people.get(userId) ?? { count: 0, share: 0 };
      store.people.set(userId, { count: collected.count + 1, share: collected.share + part });
      continue;
    }
    if (
      action === 'create' ||
      action === 'restore' ||
      (before?.visibility === 'private' && is !== undefined)
    ) {
      if (is === undefined) continue;
      rows.push({
        userId,
        type: 'tx_added',
        action: action === 'restore' ? 'restore' : 'create',
        subjectId: subject,
        amount: is,
      });
    } else if (action === 'delete') {
      if (was === undefined) continue;
      rows.push({ userId, type: 'tx_deleted', action: 'delete', subjectId: subject, amount: was });
    } else {
      const payerChanged = (before?.paidBy.userId === userId) !== (after?.paidBy.userId === userId);
      if (was === is && !payerChanged) continue;
      rows.push({
        userId,
        type: 'tx_changed',
        action: 'update',
        subjectId: subject,
        amount: is ?? 0,
        previousAmount: was ?? 0,
      });
    }
  }
  await writeActivity(tx, scope, rows);
}

/** One row per person an import (or its undo) touched, from what `collectingActivity` gathered. */
export async function recordImportActivity(
  tx: Db,
  scope: HouseholdScope,
  batchId: string,
  action: 'create' | 'undo',
  people: Map<string, Collected>,
): Promise<void> {
  if (isSilent()) return;
  people.delete(scope.userId);
  await writeActivity(
    tx,
    scope,
    [...people].map(([userId, { count, share }]) => ({
      userId,
      type: 'import_added',
      action,
      subjectId: batchId,
      amount: share,
      count,
    })),
  );
}

/**
 * A payment recorded (or deleted, or restored) by someone: the other person hears about it;
 * both do when an owner recorded it for them.
 */
export async function recordSettlementActivity(
  tx: Db,
  scope: HouseholdScope,
  action: AuditAction,
  settlement: Settlement,
): Promise<void> {
  if (isSilent()) return;
  const people = new Set([settlement.from.userId, settlement.to.userId]);
  people.delete(scope.userId);
  if (people.size === 0) return;
  const listening = await listeners(tx, scope.householdId);
  await writeActivity(
    tx,
    scope,
    [...people]
      .filter((userId) => listening.has(userId))
      .map((userId) => ({
        userId,
        type: 'settlement_recorded',
        action: action === 'update' ? 'create' : action,
        subjectId: settlement.id,
        amount: settlement.amount,
      })),
  );
}
