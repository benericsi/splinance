import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';

/**
 * Pathless layout for /login and /register: logged-in users are sent on. The demo site has
 * neither (accounts there are demo sandboxes, started from the landing page).
 */
export const Route = createFileRoute('/_auth')({
  beforeLoad: ({ context, location }) => {
    if (__DEMO_SITE__) throw redirect({ to: '/' });
    if (context.auth.getState().status === 'authenticated') {
      const { redirect: target } = redirectSearchSchema.parse(location.search);
      throw redirect({ href: safeRedirect(target) });
    }
  },
  component: Outlet,
});
