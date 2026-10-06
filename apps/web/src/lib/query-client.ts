import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './http';

const MAX_RETRIES = 2;

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Set when the component shows the error itself (e.g. form field errors). */
      suppressErrorToast?: boolean;
    };
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function createQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      // One place for mutation errors instead of an onError in every hook.
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.suppressErrorToast) return;
        toast.error(errorMessage(error));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // 4xx means the request itself is wrong; retrying will not help.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < MAX_RETRIES;
        },
      },
    },
  });
}
