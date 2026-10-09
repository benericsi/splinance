import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { NewHouseholdDialog } from '@/features/households/components/new-household-dialog';

/**
 * App-wide modals, opened from any page with `?modal=...` (URL-driven: reload, share and
 * back work). Page-bound modals are child routes instead. Unknown values are dropped.
 */
const modalSearchSchema = z.object({
  modal: z.enum(['new-household']).optional().catch(undefined),
});

/** Pathless layout: every route below it requires a logged-in user. */
export const Route = createFileRoute('/_authenticated')({
  validateSearch: modalSearchSchema,
  beforeLoad: ({ context, location }) => {
    if (context.auth.getState().status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { modal } = Route.useSearch();

  return (
    <>
      <Outlet />
      {modal === 'new-household' && <NewHouseholdDialog />}
    </>
  );
}
