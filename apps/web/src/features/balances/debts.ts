import type { Debt, TransactionPerson } from '@splinance/shared';

/** The viewer's debts (owed or owing, largest first, as the API sorts them) and the rest. */
export function splitDebts(debts: Debt[], viewerId: string): { mine: Debt[]; others: Debt[] } {
  const involves = (debt: Debt) => debt.from.userId === viewerId || debt.to.userId === viewerId;
  return { mine: debts.filter(involves), others: debts.filter((debt) => !involves(debt)) };
}

/** The other person in a debt the viewer is part of. */
export function counterpart(debt: Debt, viewerId: string): TransactionPerson {
  return debt.from.userId === viewerId ? debt.to : debt.from;
}

/**
 * Between the viewer and someone else: positive when they owe the viewer, negative when
 * the viewer owes them, 0 when they are square.
 */
export function pairBalance(debts: Debt[], viewerId: string, otherId: string): number {
  for (const debt of debts) {
    if (debt.from.userId === otherId && debt.to.userId === viewerId) return debt.amount;
    if (debt.from.userId === viewerId && debt.to.userId === otherId) return -debt.amount;
  }
  return 0;
}

/** "Ben owes you", "You owe Cara", "Cara owes Ben". */
export function describeDebt(debt: Debt, viewerId: string): string {
  if (debt.to.userId === viewerId) return `${debt.from.displayName} owes you`;
  if (debt.from.userId === viewerId) return `You owe ${debt.to.displayName}`;
  return `${debt.from.displayName} owes ${debt.to.displayName}`;
}

/** "Ben paid you", "You paid Cara", "Ben paid Cara". */
export function describePayment(
  from: TransactionPerson,
  to: TransactionPerson,
  viewerId: string,
): string {
  if (to.userId === viewerId) return `${from.displayName} paid you`;
  if (from.userId === viewerId) return `You paid ${to.displayName}`;
  return `${from.displayName} paid ${to.displayName}`;
}
