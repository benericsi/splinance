import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { balancesApi } from './api';

export const balanceQueries = {
  all: () => ['balances'] as const,
  /**
   * Everything of one household: what a settlement or transaction write invalidates
   * (transactions change debts too, see the transaction hooks).
   */
  household: (householdId: string) => [...balanceQueries.all(), householdId] as const,
  /** Who owes whom, per pair. */
  debts: (householdId: string) =>
    queryOptions({
      queryKey: [...balanceQueries.household(householdId), 'debts'],
      queryFn: ({ signal }) => balancesApi.get({ householdId, signal }),
    }),
  /** Recorded payments, newest first, paged by the API's cursor. */
  settlements: (householdId: string) =>
    infiniteQueryOptions({
      queryKey: [...balanceQueries.household(householdId), 'settlements'],
      queryFn: ({ pageParam, signal }) =>
        balancesApi.listSettlements({ householdId, cursor: pageParam ?? undefined, signal }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
};
