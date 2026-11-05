import type { Transaction, TransactionPerson } from '@splinance/shared';
import { i18n } from '@/i18n';
import { formatPercentInput } from './money';

/** "You" for the viewer, the display name for everyone else. */
export function personName(person: TransactionPerson, viewerId: string | undefined): string {
  return person.userId === viewerId ? i18n.t('transactions:you') : person.displayName;
}

/** The second line of a row: who paid and how it is split ("Anna paid · split equally"). */
export function describeTransaction(
  transaction: Transaction,
  viewerId: string | undefined,
): string {
  if (!transaction.split) return i18n.t('transactions:row.justYou');

  const { paidBy } = transaction;
  const income = transaction.kind === 'income';
  let payer: string;
  if (paidBy.userId === viewerId) {
    payer = income ? i18n.t('transactions:row.receivedYou') : i18n.t('transactions:row.paidYou');
  } else {
    const name = paidBy.displayName;
    payer = income
      ? i18n.t('transactions:row.received', { name })
      : i18n.t('transactions:row.paid', { name });
  }
  const { method, shares } = transaction.split;

  if (shares.length === 1 && shares[0]) {
    return `${payer} · ${forPerson(shares[0], viewerId)}`;
  }
  if (method === 'equal') return `${payer} · ${i18n.t('transactions:split.equally')}`;
  if (method === 'percentage') {
    return `${payer} · ${shares.map((s) => formatPercentInput(s.basisPoints ?? 0)).join(' / ')} %`;
  }
  return `${payer} · ${i18n.t('transactions:split.byAmount')}`;
}

/** "for you", "for Ben": who a one-person split is for. */
export function forPerson(
  person: Pick<TransactionPerson, 'userId' | 'displayName'>,
  viewerId: string | undefined,
): string {
  return person.userId === viewerId
    ? i18n.t('transactions:split.forYou')
    : i18n.t('transactions:split.forName', { name: person.displayName });
}

/** The viewer's part of a shared transaction, or undefined if they are not in it. */
export function viewerShare(transaction: Transaction, viewerId: string | undefined) {
  return transaction.split?.shares.find((share) => share.userId === viewerId)?.amount;
}

/** Expenses count negative, income positive (day totals, signed amounts). */
export const signedAmount = (transaction: Pick<Transaction, 'kind' | 'amount'>) =>
  transaction.kind === 'income' ? transaction.amount : -transaction.amount;
