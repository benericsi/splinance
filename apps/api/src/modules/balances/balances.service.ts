import type { Balances } from '@splinance/shared';
import { inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { requireMembership } from '../households/households.service';
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
  const people =
    ids.length === 0
      ? []
      : await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, ids));
  const nameOf = new Map(people.map((person) => [person.id, person.displayName]));
  const person = (userId: string) => ({ userId, displayName: nameOf.get(userId) ?? '' });

  return {
    currency: household.baseCurrency,
    debts: debts.map((debt) => ({
      from: person(debt.debtorId),
      to: person(debt.creditorId),
      amount: debt.amount,
    })),
  };
}
