import { MutationCache, QueryClient } from '@tanstack/react-query';
import { API_ERROR_CODES, type ApiErrorCode } from '@splinance/shared';
import { toast } from 'sonner';
import { i18n } from '@/i18n';
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

const isApiErrorCode = (code: string): code is ApiErrorCode =>
  (API_ERROR_CODES as readonly string[]).includes(code);

/**
 * What to tell people about a failed request, in the UI language: the text for the API's
 * error code (the API's own message is English, for logs). Never the raw message, which
 * would show English in a Hungarian UI.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (isApiErrorCode(error.code)) return i18n.t(`errors:codes.${error.code}`);
    if (error.code === 'NETWORK_ERROR') return i18n.t('errors:network');
  }
  return i18n.t('errors:generic');
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
