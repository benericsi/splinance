import type { Transaction, TransactionPerson } from '@splinance/shared';
import { formatPercentInput } from './money';

/** "You" for the viewer, the display name for everyone else. */
export function personName(person: TransactionPerson, viewerId: string | undefined): string {
  return person.userId === viewerId ? 'You' : person.displayName;
}

/** The second line of a row: who paid and how it is split ("Anna paid · split equally"). */
export function describeTransaction(
  transaction: Transaction,
  viewerId: string | undefined,
): string {
  if (!transaction.split) return 'Just you';

  const verb = transaction.kind === 'income' ? 'received' : 'paid';
  const payer = `${personName(transaction.paidBy, viewerId)} ${verb}`;
  const { method, shares } = transaction.split;

  if (shares.length === 1 && shares[0]) {
    const name = personName(shares[0], viewerId);
    return `${payer} · for ${name === 'You' ? 'you' : name}`;
  }
  if (method === 'equal') return `${payer} · split equally`;
  if (method === 'percentage') {
    return `${payer} · ${shares.map((s) => formatPercentInput(s.basisPoints ?? 0)).join(' / ')} %`;
  }
  return `${payer} · split by amount`;
}

/** The viewer's part of a shared transaction, or undefined if they are not in it. */
export function viewerShare(transaction: Transaction, viewerId: string | undefined) {
  return transaction.split?.shares.find((share) => share.userId === viewerId)?.amount;
}

/** Expenses count negative, income positive (day totals, signed amounts). */
export const signedAmount = (transaction: Pick<Transaction, 'kind' | 'amount'>) =>
  transaction.kind === 'income' ? transaction.amount : -transaction.amount;
