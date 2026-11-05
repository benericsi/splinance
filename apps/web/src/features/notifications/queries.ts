import { queryOptions } from '@tanstack/react-query';
import { notificationsApi } from './api';

/** The badge is polled this often (and on window focus); there is no push yet. */
export const UNREAD_POLL_MS = 5 * 60_000;

export const notificationQueries = {
  all: () => ['notifications'] as const,
  /** The signed-in person's bell, across households. */
  list: () =>
    queryOptions({
      queryKey: [...notificationQueries.all(), 'list'],
      queryFn: ({ signal }) => notificationsApi.list({ signal }),
    }),
  unreadCount: () =>
    queryOptions({
      queryKey: [...notificationQueries.all(), 'unread'],
      queryFn: ({ signal }) => notificationsApi.unreadCount({ signal }),
      refetchInterval: UNREAD_POLL_MS,
      refetchOnWindowFocus: true,
    }),
  settings: (householdId: string) =>
    queryOptions({
      queryKey: [...notificationQueries.all(), 'settings', householdId],
      queryFn: ({ signal }) => notificationsApi.settings({ householdId, signal }),
    }),
};
