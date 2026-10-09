import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { authStore } from '@/lib/auth-store';
import { rerunGuardsOnSessionEnd } from '@/lib/session-watch';
import { routeTree } from '@/routeTree.gen';
import { onTestFinished } from 'vitest';

/** Renders the real route tree at `path` with a fresh QueryClient and memory history. */
export function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient, auth: authStore },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  // Same wiring as main.tsx: logout and expired sessions re-run the route guards.
  onTestFinished(rerunGuardsOnSessionEnd(authStore, router));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
