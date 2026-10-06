import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { ErrorPage, NotFoundPage } from '@/components/route-states';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ensureSessionRestored } from '@/features/auth/session';
import type { AuthStore } from '@/lib/auth-store';
import { useTheme } from '@/lib/theme';

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
  notFoundComponent: () => <NotFoundPage fullPage />,
  errorComponent: (props) => <ErrorPage {...props} fullPage />,
});

/** App shell shared by every page; layouts live in _auth and _authenticated. */
function RootLayout() {
  const { resolved } = useTheme();

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground min-h-svh">
        <Outlet />
      </div>
      <Toaster position="top-center" richColors closeButton theme={resolved} />
      <Suspense>
        <Devtools />
      </Suspense>
    </TooltipProvider>
  );
}
