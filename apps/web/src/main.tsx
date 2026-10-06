import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { authStore } from '@/lib/auth-store';
import { createQueryClient } from '@/lib/query-client';
import { routeTree } from './routeTree.gen';
import './index.css';

const queryClient = createQueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient, auth: authStore },
  defaultPreload: 'intent',
  // Loaders only warm the Query cache; Query owns freshness, so the router never caches.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

// Makes every Link, navigate() and useParams() type-check against the real route tree.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Logout, or a refresh that failed mid-session: re-run route guards so protected
// pages redirect to /login instead of showing stale content.
let previousStatus = authStore.getState().status;
authStore.subscribe(() => {
  const { status } = authStore.getState();
  if (previousStatus === 'authenticated' && status === 'anonymous') void router.invalidate();
  previousStatus = status;
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
