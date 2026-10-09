import { createFileRoute, redirect } from '@tanstack/react-router';
import { readLastHousehold } from '@/features/households/last-household';
import { householdQueries } from '@/features/households/queries';

export const Route = createFileRoute('/_authenticated/')({
  // `/` is a dispatcher: the household used last, else the first one, else onboarding.
  loader: async ({ context: { queryClient, auth } }) => {
    const households = await queryClient.query(householdQueries.list());
    const userId = auth.getState().user?.id;
    const last = userId ? readLastHousehold(userId) : undefined;
    const target = households.find((h) => h.id === last) ?? households[0];
    if (!target) throw redirect({ to: '/welcome', replace: true });
    throw redirect({
      to: '/h/$householdId',
      params: { householdId: target.id },
      search: true,
      replace: true,
    });
  },
});
