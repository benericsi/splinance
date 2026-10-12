import {
  balancesResponseSchema,
  type SettlementInput,
  settlementListResponseSchema,
  settlementResponseSchema,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const settlementsPath = (householdId: string) => `${householdPath(householdId)}/settlements`;
const settlementPath = (householdId: string, settlementId: string) =>
  `${settlementsPath(householdId)}/${encodeURIComponent(settlementId)}`;

interface SettlementRef {
  householdId: string;
  settlementId: string;
}

export const balancesApi = {
  get: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(`${householdPath(householdId)}/balances`, balancesResponseSchema, { signal }))
      .balances,
  listSettlements: ({
    householdId,
    cursor,
    signal,
  }: {
    householdId: string;
    cursor?: string | undefined;
    signal?: AbortSignal;
  }) => {
    const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : '';
    return http.get(`${settlementsPath(householdId)}${query}`, settlementListResponseSchema, {
      signal,
    });
  },
  createSettlement: async ({
    householdId,
    input,
  }: {
    householdId: string;
    input: SettlementInput;
  }) => (await http.post(settlementsPath(householdId), settlementResponseSchema, input)).settlement,
  removeSettlement: ({ householdId, settlementId }: SettlementRef) =>
    http.delete(settlementPath(householdId, settlementId), noContent),
  restoreSettlement: async ({ householdId, settlementId }: SettlementRef) =>
    (
      await http.post(
        `${settlementPath(householdId, settlementId)}/restore`,
        settlementResponseSchema,
      )
    ).settlement,
};
