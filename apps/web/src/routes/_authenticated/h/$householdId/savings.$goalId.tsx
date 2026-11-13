import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useCallback } from 'react';
import { householdQueries } from '@/features/households/queries';
import { GoalDialog } from '@/features/savings/components/goal-dialog';
import { savingsQueries } from '@/features/savings/queries';
import { memberFills } from '@/features/savings/view';
import { currentMonth } from '@/features/transactions/dates';
import { useAuth } from '@/lib/auth-store';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: a goal (add or take out, history, edit, close) over the savings page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/savings/$goalId')({
  loader: async ({ context: { queryClient }, params: { householdId, goalId } }) => {
    const savings = await queryClient.query(savingsQueries.month(householdId, currentMonth()));
    // Also a private goal of someone else: the API never lists it.
    if (!savings.goals.some((goal) => goal.id === goalId)) throw notFound();
  },
  component: GoalRoute,
});

function GoalRoute() {
  const { householdId, goalId } = Route.useParams();
  const navigate = Route.useNavigate();
  const viewerId = useAuth().user?.id ?? '';
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data } = useSuspenseQuery(savingsQueries.month(householdId, currentMonth()));
  const goal = data.goals.find((item) => item.id === goalId);
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/savings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );
  if (!goal) return null;

  return (
    <GoalDialog
      key={goal.id}
      household={household}
      goal={goal}
      fills={memberFills(data.goals, viewerId)}
      viewerId={viewerId}
      onClose={close}
    />
  );
}
