import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authStore } from '@/lib/auth-store';
import { pageLoad } from '@/lib/demo-site';
import { demoApi } from './api';

/** "Try the demo": the visitor is signed in once their household is seeded (a second or two). */
export function useStartDemo() {
  return useMutation({
    mutationFn: demoApi.start,
    onSuccess: ({ accessToken, user }) => {
      authStore.setSession(accessToken, user);
    },
  });
}

/**
 * Deletes the sandbox and makes a new one. The new household opens with a full page load:
 * every cached query and mounted page belongs to the deleted one, and the new refresh
 * cookie restores the session on load.
 */
export function useStartOver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await demoApi.end();
      try {
        return await demoApi.start();
      } catch (error) {
        // The old sandbox is gone already: back to the landing page, with the error toast.
        authStore.clear('logout');
        queryClient.clear();
        throw error;
      }
    },
    onSuccess: ({ householdId }) => {
      pageLoad.replace(`/h/${householdId}`);
    },
  });
}

/** "End demo" (the demo's log out): the sandbox is deleted and the guards go back to the landing page. */
export function useEndDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: demoApi.end,
    onSuccess: () => {
      authStore.clear('logout');
      queryClient.clear();
    },
  });
}
