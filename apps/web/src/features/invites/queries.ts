import { queryOptions } from '@tanstack/react-query';
import { invitesApi } from './api';

export const inviteQueries = {
  all: () => ['invites'] as const,
  list: (householdId: string) =>
    queryOptions({
      queryKey: [...inviteQueries.all(), 'list', householdId],
      queryFn: ({ signal }) => invitesApi.list({ householdId, signal }),
    }),
  preview: (token: string) =>
    queryOptions({
      queryKey: [...inviteQueries.all(), 'preview', token],
      queryFn: ({ signal }) => invitesApi.preview({ token, signal }),
    }),
};
