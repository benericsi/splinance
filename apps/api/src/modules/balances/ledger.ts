import { type DebtFlow, netDebts } from '@splinance/shared';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { settlements, transactions, transactionSplits } from '../../db/schema';
import { HttpError } from '../../lib/http-error';

/**
 * Every directed debt in a household, summed per (debtor, creditor):
 * - a shared expense: each person with a share owes the payer that share;
 * - a shared income: whoever received it owes each person with a share that share;
 * - a settlement: the payment moves the debt the other way (the receiver now owes it back,
 *   which nets against what the payer owed).
 * Private and deleted rows never count; a payer's own share is not a debt.
 *
 * Kept apart from the balances service (which checks membership) so the households
 * service can use it without an import cycle.
 */
async function debtFlows(executor: Db, householdId: string): Promise<DebtFlow[]> {
  const isExpense = sql`${transactions.kind} = 'expense'`;
  const debtor = sql<string>`case when ${isExpense} then ${transactionSplits.userId} else ${transactions.paidBy} end`;
  const creditor = sql<string>`case when ${isExpense} then ${transactions.paidBy} else ${transactionSplits.userId} end`;

  // One after the other: inside a transaction both run on the same connection.
  const shareRows = await executor
    .select({
      debtorId: debtor,
      creditorId: creditor,
      amount: sql<string>`sum(${transactionSplits.amount})`,
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
    .where(
      and(
        eq(transactionSplits.householdId, householdId),
        eq(transactions.visibility, 'shared'),
        isNull(transactions.deletedAt),
        ne(transactionSplits.userId, transactions.paidBy),
      ),
    )
    .groupBy(debtor, creditor);
  const settlementRows = await executor
    .select({
      debtorId: settlements.toUserId,
      creditorId: settlements.fromUserId,
      amount: sql<string>`sum(${settlements.amount})`,
    })
    .from(settlements)
    .where(and(eq(settlements.householdId, householdId), isNull(settlements.deletedAt)))
    .groupBy(settlements.toUserId, settlements.fromUserId);

  // Postgres returns bigint sums as strings; they stay far below 2^53 (see MAX_AMOUNT_MINOR).
  return [...shareRows, ...settlementRows].map((row) => ({ ...row, amount: Number(row.amount) }));
}

/** The open debts of a household, netted per pair of people. */
export async function openDebts(executor: Db, householdId: string): Promise<DebtFlow[]> {
  return netDebts(await debtFlows(executor, householdId));
}

/**
 * Throws 409 UNSETTLED_BALANCE if `userId` (or, without one, anyone) still owes or is owed
 * money. Call it after `lockHousehold()`: transaction and settlement writes take a shared
 * lock on the household, so nothing can change the balance before the caller commits.
 */
export async function assertSettled(
  tx: Db,
  householdId: string,
  { userId, message }: { userId?: string; message: string },
): Promise<void> {
  const debts = await openDebts(tx, householdId);
  const open = debts.some(
    (debt) => userId === undefined || debt.debtorId === userId || debt.creditorId === userId,
  );
  if (open) throw new HttpError(409, message, 'UNSETTLED_BALANCE');
}
