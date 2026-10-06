import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { UserMenu } from '@/features/auth/components/user-menu';
import { ensureSessionRestored } from '@/features/auth/session';
import { type AuthStore, useAuth } from '@/lib/auth-store';

export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthStore;
}

// Devtools are loaded only in development, so they never reach the production bundle.
const Devtools = import.meta.env.DEV ? lazy(() => import('@/components/devtools')) : () => null;

export const Route = createRootRouteWithContext<RouterContext>()({
  // Every navigation waits for the one-time session restore, so guards see the real state.
  beforeLoad: () => ensureSessionRestored(),
  component: RootLayout,
});

function RootLayout() {
  const { user } = useAuth();

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-heading text-lg font-semibold">
            Splinance
          </Link>
          {user && <UserMenu user={user} />}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
      <Toaster position="top-center" richColors closeButton />
      <Suspense>
        <Devtools />
      </Suspense>
    </div>
  );
}
