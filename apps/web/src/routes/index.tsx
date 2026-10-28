import { createFileRoute, redirect } from '@tanstack/react-router';
import { DemoLanding } from '@/features/demo/components/demo-landing';
import { readLastHousehold } from '@/features/households/last-household';
import { householdQueries } from '@/features/households/queries';

/**
 * `/` is a dispatcher for signed-in users: the household used last, else the first one,
 * else onboarding. Anonymous visitors go to /login, except on the demo site, where this is
 * the landing page with "Try the demo".
 */
export const Route = createFileRoute('/')({
  beforeLoad: ({ context, location }) => {
    const { status, endedBy } = context.auth.getState();
    if (status !== 'authenticated' && !__DEMO_SITE__) {
      // As in _authenticated: come back after logging in, but not after a logout.
      throw redirect({
        to: '/login',
        search: endedBy === 'logout' ? {} : { redirect: location.href },
      });
    }
  },
  loader: async ({ context: { queryClient, auth } }) => {
    const userId = auth.getState().user?.id;
    if (!userId) return;
    const households = await queryClient.query(householdQueries.list());
    const last = readLastHousehold(userId);
    const target = households.find((h) => h.id === last) ?? households[0];
    if (!target) throw redirect({ to: '/welcome', replace: true });
    throw redirect({
      to: '/h/$householdId',
      params: { householdId: target.id },
      search: true,
      replace: true,
    });
  },
  component: Home,
});

function Home() {
  return __DEMO_SITE__ ? <DemoLanding /> : null;
}
