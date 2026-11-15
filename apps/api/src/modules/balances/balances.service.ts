import type { Balances } from '@splinance/shared';
import { db } from '../../db/client';
import { requireMembership } from '../households/households.service';
import { namesOf, personOf } from '../households/people';
import { openDebts } from './ledger';

interface HouseholdScope {
  userId: string;
  householdId: string;
}

/**
 * Who owes whom, per pair. Every member sees every debt: balances come only from shared
 * transactions and settlements, which all members can see anyway.
 */
export async function getBalances(scope: HouseholdScope): Promise<Balances> {
  const { household } = await requireMembership(db, scope);
  const debts = await openDebts(db, scope.householdId);

  const ids = [...new Set(debts.flatMap((debt) => [debt.debtorId, debt.creditorId]))];
  const person = personOf(await namesOf(db, ids));

  return {
    currency: household.baseCurrency,
    debts: debts.map((debt) => ({
      from: person(debt.debtorId),
      to: person(debt.creditorId),
      amount: debt.amount,
    })),
  };
}
