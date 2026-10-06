import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';

/** Pathless layout for /login and /register: logged-in users are sent on. */
export const Route = createFileRoute('/_auth')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.getState().status === 'authenticated') {
      const { redirect: target } = redirectSearchSchema.parse(location.search);
      throw redirect({ href: safeRedirect(target) });
    }
  },
  component: Outlet,
});
