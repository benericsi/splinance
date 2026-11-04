import {
  type RecurringPreviewInput,
  recurringListResponseSchema,
  recurringPreviewResponseSchema,
  type RecurringSeriesInput,
  recurringSeriesResponseSchema,
  type RecurringSuggestionDecision,
  type UpdateRecurringSeriesInput,
} from '@splinance/shared';
import { householdPath } from '@/features/households/api';
import { http, noContent } from '@/lib/http';

const listPath = (householdId: string) => `${householdPath(householdId)}/recurring`;
const itemPath = (householdId: string, seriesId: string) =>
  `${listPath(householdId)}/${encodeURIComponent(seriesId)}`;

interface SeriesRef {
  householdId: string;
  seriesId: string;
}

export const recurringApi = {
  list: async ({ householdId, signal }: { householdId: string; signal?: AbortSignal }) =>
    (await http.get(listPath(householdId), recurringListResponseSchema, { signal })).recurring,
  create: async ({ householdId, input }: { householdId: string; input: RecurringSeriesInput }) =>
    (await http.post(listPath(householdId), recurringSeriesResponseSchema, input)).series,
  preview: ({
    householdId,
    input,
    signal,
  }: {
    householdId: string;
    input: RecurringPreviewInput;
    signal?: AbortSignal;
  }) =>
    http.post(`${listPath(householdId)}/preview`, recurringPreviewResponseSchema, input, {
      signal,
    }),
  confirm: async ({
    householdId,
    decision,
  }: {
    householdId: string;
    decision: RecurringSuggestionDecision;
  }) =>
    (
      await http.post(
        `${listPath(householdId)}/suggestions/confirm`,
        recurringSeriesResponseSchema,
        decision,
      )
    ).series,
  dismiss: ({
    householdId,
    decision,
  }: {
    householdId: string;
    decision: RecurringSuggestionDecision;
  }) => http.post(`${listPath(householdId)}/suggestions/dismiss`, noContent, decision),
  update: async ({
    householdId,
    seriesId,
    input,
  }: SeriesRef & { input: UpdateRecurringSeriesInput }) =>
    (await http.patch(itemPath(householdId, seriesId), recurringSeriesResponseSchema, input))
      .series,
  /** Stop tracking a series, or "Show again" for a dismissed suggestion. */
  remove: ({ householdId, seriesId }: SeriesRef) =>
    http.delete(itemPath(householdId, seriesId), noContent),
};
