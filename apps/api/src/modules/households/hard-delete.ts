import { inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import {
  auditLog,
  budgets,
  categories,
  categoryRules,
  householdInvites,
  householdMembers,
  households,
  importBatches,
  notifications,
  recurringSeries,
  settlements,
  transactionSplits,
  transactions,
} from '../../db/schema';

/**
 * Everything inside these households, in dependency order (every foreign key is NO ACTION
 * and the app otherwise only soft deletes). The households' own rows are left for the
 * caller, which may have to delete rows that reference them first (`demos`). A new table
 * that references households or members belongs in this list; the deleteDemo and account
 * deletion tests check that nothing is left.
 *
 * Locks the households first (in id order, the one lock order), so a write still running
 * in them finishes before anything is deleted. Deleting splits fires the deferred
 * split-sum trigger, which skips transactions that no longer exist.
 */
export async function deleteHouseholdContents(tx: Db, householdIds: string[]): Promise<void> {
  if (householdIds.length === 0) return;
  await tx
    .select({ id: households.id })
    .from(households)
    .where(inArray(households.id, householdIds))
    .orderBy(households.id)
    .for('update');
  for (const table of [
    notifications,
    auditLog,
    transactionSplits,
    transactions,
    importBatches,
    settlements,
    budgets,
    recurringSeries,
    categoryRules,
    householdInvites,
    categories,
    householdMembers,
  ]) {
    await tx.delete(table).where(inArray(table.householdId, householdIds));
  }
}
