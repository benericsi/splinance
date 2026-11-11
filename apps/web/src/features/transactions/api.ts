import {
  type TransactionInput,
  transactionListResponseSchema,
  transactionResponseSchema,
  transactionSummaryResponseSchema,
  type UpdateTransactionInput,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const listPath = (householdId: string) => `${householdPath(householdId)}/transactions`;
const itemPath = (householdId: string, transactionId: string) =>
  `${listPath(householdId)}/${encodeURIComponent(transactionId)}`;

interface TransactionRef {
  householdId: string;
  transactionId: string;
}

export const transactionsApi = {
  list: ({
    householdId,
    month,
    cursor,
    signal,
  }: {
    householdId: string;
    month: string;
    cursor?: string | undefined;
    signal?: AbortSignal;
  }) => {
    const query = new URLSearchParams({ month });
    if (cursor) query.set('cursor', cursor);
    return http.get(`${listPath(householdId)}?${query.toString()}`, transactionListResponseSchema, {
      signal,
    });
  },
  /** Everything on one day (the calendar's day view): one page, the API's largest. */
  listDay: async ({
    householdId,
    date,
    categoryId,
    signal,
  }: {
    householdId: string;
    date: string;
    categoryId?: string | undefined;
    signal?: AbortSignal;
  }) => {
    const query = new URLSearchParams({ on: date, limit: '100' });
    if (categoryId) query.set('categoryId', categoryId);
    return (
      await http.get(
        `${listPath(householdId)}?${query.toString()}`,
        transactionListResponseSchema,
        {
          signal,
        },
      )
    ).transactions;
  },
  summary: async ({
    householdId,
    month,
    signal,
  }: {
    householdId: string;
    month: string;
    signal?: AbortSignal;
  }) =>
    (
      await http.get(
        `${listPath(householdId)}/summary?${new URLSearchParams({ month }).toString()}`,
        transactionSummaryResponseSchema,
        { signal },
      )
    ).summary,
  get: async ({ householdId, transactionId, signal }: TransactionRef & { signal?: AbortSignal }) =>
    (await http.get(itemPath(householdId, transactionId), transactionResponseSchema, { signal }))
      .transaction,
  create: async ({ householdId, input }: { householdId: string; input: TransactionInput }) =>
    (await http.post(listPath(householdId), transactionResponseSchema, input)).transaction,
  update: async ({
    householdId,
    transactionId,
    input,
  }: TransactionRef & { input: UpdateTransactionInput }) =>
    (await http.put(itemPath(householdId, transactionId), transactionResponseSchema, input))
      .transaction,
  remove: ({ householdId, transactionId }: TransactionRef) =>
    http.delete(itemPath(householdId, transactionId), noContent),
  restore: async ({ householdId, transactionId }: TransactionRef) =>
    (await http.post(`${itemPath(householdId, transactionId)}/restore`, transactionResponseSchema))
      .transaction,
};
