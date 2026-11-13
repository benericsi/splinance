import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RouteDialog } from '@/components/route-dialog';
import { householdQueries } from '@/features/households/queries';
import { GoalForm } from '@/features/savings/components/goal-form';
import { useCreateGoal } from '@/features/savings/hooks';
import { useCloseModal } from '@/lib/route-modal';

/** Child route: the new goal dialog renders over the savings page. */
export const Route = createFileRoute('/_authenticated/h/$householdId/savings/new')({
  component: NewGoalRoute,
});

function NewGoalRoute() {
  const { t } = useTranslation('savings');
  const { householdId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const create = useCreateGoal();
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '/h/$householdId/savings', params: { householdId }, replace: true });
    }, [navigate, householdId]),
  );

  return (
    <RouteDialog title={t('form.newTitle')} onClose={close}>
      <GoalForm
        currency={household.baseCurrency}
        error={create.error}
        submitLabel={t('form.create')}
        onSubmit={async (input) => {
          await create.mutateAsync({ householdId, input });
          toast.success(t('form.created'));
          close();
        }}
      />
    </RouteDialog>
  );
}
