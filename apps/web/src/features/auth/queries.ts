import { queryOptions } from '@tanstack/react-query';
import { authApi } from './api';

export const authQueries = {
  all: () => ['auth'] as const,
  /** Fixed per deployment; one request per page load is enough. */
  providers: () =>
    queryOptions({
      queryKey: [...authQueries.all(), 'providers'],
      queryFn: ({ signal }) => authApi.providers({ signal }),
      staleTime: Infinity,
      retry: false,
    }),
  /** Read once when /login?oauth=link opens; the cookie expires after 10 minutes. */
  pendingLink: () =>
    queryOptions({
      queryKey: [...authQueries.all(), 'pending-link'],
      queryFn: ({ signal }) => authApi.pendingLink({ signal }),
      staleTime: Infinity,
      retry: false,
    }),
};
