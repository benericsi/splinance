import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRoute,
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { authStore } from '@/lib/auth-store';
import { rerunGuardsOnSessionEnd } from '@/lib/session-watch';
import { routeTree } from '@/routeTree.gen';
import { beforeAll, onTestFinished } from 'vitest';

/**
 * Renders the real route tree at `path` with a fresh QueryClient and memory history.
 * Loading skeletons are off unless `pendingMs` is given: they show a page's real heading,
 * so a test waiting for it could otherwise race the data.
 */
export function renderRoute(path: string, { pendingMs = Infinity }: { pendingMs?: number } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient, auth: authStore },
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: pendingMs,
    defaultPendingMinMs: 0,
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

/**
 * Routes are code-split (`autoCodeSplitting`): the first render of a page in a file would
 * import its chunks (layouts, page, everything they import) inside the test's first
 * findBy*, which under a full parallel run took most of the 5 s limit and sometimes more.
 * Every file that renders routes loads all route code once before its tests instead.
 */
beforeAll(async () => {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient(), auth: authStore },
  });
  await Promise.all(
    Object.values(router.routesById).map(async (route: AnyRoute) => {
      await router.loadRouteChunk(route);
    }),
  );
}, 60_000);
