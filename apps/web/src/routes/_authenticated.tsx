import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/** Pathless layout: every route below it requires a logged-in user. */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.getState().status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: Outlet,
});
