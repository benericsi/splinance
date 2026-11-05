import type { AccountDeletionPreview, DeleteAccountInput } from '@splinance/shared';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import {
  auditLog,
  budgets,
  householdMembers,
  households,
  importBatches,
  notifications,
  recurringSeries,
  sessions,
  transactionSplits,
  transactions,
  userIdentities,
  users,
  type UserRow,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { openDebts } from '../balances/ledger';
import { deleteHouseholdContents } from '../households/hard-delete';
import { endMembership } from '../households/households.service';
import { activeSession, type Caller, lockUser, requireRecentAuth } from './account.service';

/** What a deleted account's row shows wherever its history appears. */
export const FORMER_MEMBER_NAME = 'Former member';

type Household = AccountDeletionPreview['leaves'][number];

interface DeletionPlan extends AccountDeletionPreview {
  /** Active memberships in archived households: ended too, nothing else to decide. */
  archivedMemberships: string[];
}

/**
 * Decides what deleting the user means for each household they are an active member of:
 * - nobody else was ever a member: deleted with everything in it (it is only their data);
 * - others are members: they leave, shared entries stay (the others' balances depend on them);
 * - only former members besides them: archived (its history references people who left).
 * Blockers, as for leaving: an open balance with anyone, or being the only owner of a
 * household that still has other members.
 */
async function planDeletion(executor: Db, userId: string): Promise<DeletionPlan> {
  const memberships = await executor
    .select({
      householdId: households.id,
      householdName: households.name,
      archivedAt: households.archivedAt,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(eq(householdMembers.userId, userId), isNull(householdMembers.leftAt)))
    .orderBy(households.id);

  const plan: DeletionPlan = {
    blockers: [],
    leaves: [],
    deletes: [],
    archives: [],
    privateTransactionCount: 0,
    archivedMemberships: [],
  };

  for (const { householdId, householdName, archivedAt, role } of memberships) {
    if (archivedAt) {
      plan.archivedMemberships.push(householdId);
      continue;
    }
    const household: Household = { householdId, householdName };
    const others = await executor
      .select({ role: householdMembers.role, leftAt: householdMembers.leftAt })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.householdId, householdId), ne(householdMembers.userId, userId)),
      );
    const activeOthers = others.filter((m) => m.leftAt === null);

    const debts = await openDebts(executor, householdId);
    if (debts.some((d) => d.debtorId === userId || d.creditorId === userId)) {
      plan.blockers.push({ ...household, code: 'UNSETTLED_BALANCE' });
    }
    if (
      role === 'owner' &&
      activeOthers.length > 0 &&
      !activeOthers.some((m) => m.role === 'owner')
    ) {
      plan.blockers.push({ ...household, code: 'LAST_OWNER' });
    }

    if (others.length === 0) plan.deletes.push(household);
    else if (activeOthers.length === 0) plan.archives.push(household);
    else plan.leaves.push(household);
  }

  plan.privateTransactionCount = await executor.$count(
    transactions,
    and(
      eq(transactions.createdBy, userId),
      eq(transactions.visibility, 'private'),
      isNull(transactions.deletedAt),
    ),
  );
  return plan;
}

export async function previewDeletion(userId: string): Promise<AccountDeletionPreview> {
  const { blockers, leaves, deletes, archives, privateTransactionCount } = await planDeletion(
    db,
    userId,
  );
  return { blockers, leaves, deletes, archives, privateTransactionCount };
}

/**
 * Locks every household the user is an active member of, in id order (the one global
 * order; hard parts 12, 24): balance checks and the deletion then cannot interleave with
 * a new expense naming them or a role change.
 */
async function lockMemberships(tx: Db, userId: string): Promise<void> {
  const ids = tx
    .select({ id: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), isNull(householdMembers.leftAt)));
  await tx
    .select({ id: households.id })
    .from(households)
    .where(inArray(households.id, ids))
    .orderBy(households.id)
    .for('update');
}

export interface DeletionResult {
  householdsLeft: number;
  householdsDeleted: number;
  householdsArchived: number;
  privateTransactionsDeleted: number;
}

/**
 * Erases the user under the plan: the row stays (history and the composite foreign keys
 * reference it) with nothing personal left; credentials go; private transactions are hard
 * deleted with their audit rows (only their author could ever read them, and the audit
 * rows hold copies); households only they were ever in are deleted whole.
 */
async function erase(
  tx: Db,
  user: UserRow,
  plan: DeletionPlan,
  now: Date,
): Promise<DeletionResult> {
  // Collected first: households deleted whole take some of them along.
  const privateRows = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.createdBy, user.id), eq(transactions.visibility, 'private')));
  const privateIds = privateRows.map((r) => r.id);
  const deleteIds = plan.deletes.map((h) => h.householdId);
  await deleteHouseholdContents(tx, deleteIds);
  if (deleteIds.length > 0) await tx.delete(households).where(inArray(households.id, deleteIds));

  if (privateIds.length > 0) {
    await tx
      .delete(auditLog)
      .where(and(eq(auditLog.entity, 'transaction'), inArray(auditLog.entityId, privateIds)));
    await tx.delete(transactionSplits).where(inArray(transactionSplits.transactionId, privateIds));
    await tx.delete(transactions).where(inArray(transactions.id, privateIds));
  }

  for (const { householdId } of [...plan.leaves, ...plan.archives]) {
    await endMembership(tx, householdId, user.id);
  }
  for (const householdId of plan.archivedMemberships) {
    await endMembership(tx, householdId, user.id);
  }
  const archiveIds = plan.archives.map((h) => h.householdId);
  if (archiveIds.length > 0) {
    await tx.update(households).set({ archivedAt: now }).where(inArray(households.id, archiveIds));
  }

  // A bank export's file name can carry personal data; the batches stay for their rows.
  await tx
    .update(importBatches)
    .set({ fileName: null })
    .where(eq(importBatches.createdBy, user.id));
  await tx.delete(budgets).where(eq(budgets.userId, user.id));
  // Private recurring payments hold their names and the merchants they match.
  await tx.delete(recurringSeries).where(eq(recurringSeries.userId, user.id));
  await tx.delete(notifications).where(eq(notifications.userId, user.id));
  await tx.delete(userIdentities).where(eq(userIdentities.userId, user.id));
  await tx.delete(sessions).where(eq(sessions.userId, user.id));
  await tx
    .update(users)
    .set({
      displayName: FORMER_MEMBER_NAME,
      // `.invalid` never resolves (RFC 2606), like demo accounts; the real address is free.
      email: `deleted-${user.id}@deleted.invalid`,
      passwordHash: null,
      deletedAt: now,
    })
    .where(eq(users.id, user.id));

  return {
    householdsLeft: plan.leaves.length,
    householdsDeleted: deleteIds.length,
    householdsArchived: archiveIds.length,
    privateTransactionsDeleted: privateIds.length,
  };
}

const sessionEnded = () =>
  new HttpError(401, 'Your session has ended, please log in again', 'UNAUTHENTICATED');

/**
 * Self-service deletion (GDPR Art. 17): step-up, the email typed again, then the plan,
 * checked again under the locks. Refused as a whole while a blocker exists.
 */
export async function deleteAccount(
  caller: Caller,
  input: DeleteAccountInput,
  now = new Date(),
): Promise<DeletionResult> {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, caller.userId);
    if (user.deletedAt) throw sessionEnded();
    const session = await activeSession(tx, caller, now);
    if (input.confirmEmail !== user.email) {
      throw new HttpError(400, 'Type your email exactly as shown', 'CONFIRMATION_MISMATCH');
    }
    await requireRecentAuth(user, session, input.currentPassword, now);

    await lockMemberships(tx, user.id);
    const plan = await planDeletion(tx, user.id);
    const [blocker] = plan.blockers;
    if (blocker) {
      throw new HttpError(
        409,
        blocker.code === 'UNSETTLED_BALANCE'
          ? `Settle up in ${blocker.householdName} first`
          : `Make someone else an owner of ${blocker.householdName} first`,
        blocker.code,
      );
    }
    return erase(tx, user, plan, now);
  });
}

/**
 * The same erasure without the person, for the restore runbook (deploy.md 5): a deletion
 * made after the backup's date is repeated by user id. It passed its blockers back then,
 * so they are not checked again. Idempotent: an already deleted user is left alone.
 */
export async function eraseAccount(
  userId: string,
  now = new Date(),
): Promise<DeletionResult | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!user || user.deletedAt) return null;
    await lockMemberships(tx, user.id);
    return erase(tx, user, await planDeletion(tx, user.id), now);
  });
}
