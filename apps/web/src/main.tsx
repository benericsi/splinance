import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorPage, NotFoundPage } from '@/components/route-states';
import { watchInstallPrompt } from '@/features/pwa/install';
import { startServiceWorker } from '@/features/pwa/register';
import { authStore } from '@/lib/auth-store';
// Applies a saved "hide amounts" before the first render.
import '@/lib/hide-amounts';
import { detectLocale, followUserLocale, localeStore } from '@/lib/locale';
import { createQueryClient } from '@/lib/query-client';
import { rerunGuardsOnSessionEnd } from '@/lib/session-watch';
import { routeTree } from './routeTree.gen';
import './index.css';

const queryClient = createQueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient, auth: authStore },
  defaultPreload: 'intent',
  // Loaders only warm the Query cache; Query owns freshness, so the router never caches.
  defaultPreloadStaleTime: 0,
  // A page that takes a moment shows its skeleton (pendingComponent), and keeps it long
  // enough not to flash; quicker ones (most, thanks to preloading on intent) never do.
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
  scrollRestoration: true,
  // Inside layouts (e.g. a missing household later); the root shows full-page versions.
  defaultNotFoundComponent: () => <NotFoundPage />,
  defaultErrorComponent: ErrorPage,
});

// Makes every Link, navigate() and useParams() type-check against the real route tree.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

rerunGuardsOnSessionEnd(authStore, router);
watchInstallPrompt();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

// Keep the static splash from index.html until the session is restored, the first route
// has loaded and the language's strings are there, so users never see a blank frame, a
// flash of the login page or a flash of English. A signed-in user's saved language then
// wins over the device's (still behind the splash).
await Promise.all([router.load(), localeStore.setLocale(detectLocale(), { persist: false })]);
await followUserLocale(authStore);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

startServiceWorker();
