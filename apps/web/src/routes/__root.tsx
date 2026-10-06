import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

export interface RouterContext {
  queryClient: QueryClient;
}

// Devtools are loaded only in development, so they never reach the production bundle.
const Devtools = import.meta.env.DEV ? lazy(() => import('@/components/devtools')) : () => null;

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link to="/" className="font-heading text-lg font-semibold">
            Splinance
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
      <Suspense>
        <Devtools />
      </Suspense>
    </div>
  );
}
