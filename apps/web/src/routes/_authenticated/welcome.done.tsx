import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check, Clock, UserPlus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { householdQueries } from '@/features/households/queries';
import { inviteQueries } from '@/features/invites/queries';
import { OnboardingLayout } from '@/features/onboarding/components/onboarding-layout';
import { householdStepSearchSchema, loadStepHousehold } from '@/features/onboarding/household-step';

/** Step 4: summary and the way into the app. */
export const Route = createFileRoute('/_authenticated/welcome/done')({
  validateSearch: householdStepSearchSchema,
  loaderDeps: ({ search }) => ({ householdId: search.household }),
  loader: ({ context: { queryClient }, deps: { householdId } }) =>
    loadStepHousehold(queryClient, householdId),
  component: DoneStep,
});

function DoneStep() {
  const { id } = Route.useLoaderData();
  const { data: household } = useSuspenseQuery(householdQueries.detail(id));
  const { data: invites = [] } = useQuery(inviteQueries.list(id));
  const invited = invites.length > 0;

  return (
    <OnboardingLayout
      step={4}
      steps={4}
      title={`${household.name} is ready`}
      description="Shared expenses and balances arrive next. Here is where you stand."
    >
      <ul className="mb-8 space-y-3">
        <li className="flex items-center gap-3">
          <Check className="text-positive size-5 shrink-0" aria-hidden />
          Household created
        </li>
        <li className="flex items-center gap-3">
          {invited ? (
            <Clock className="text-muted-foreground size-5 shrink-0" aria-hidden />
          ) : (
            <UserPlus className="text-muted-foreground size-5 shrink-0" aria-hidden />
          )}
          {invited
            ? 'Invite sent, waiting for them to join'
            : 'Invite someone anytime from settings'}
        </li>
      </ul>
      <Link
        to="/h/$householdId"
        params={{ householdId: household.id }}
        className={buttonVariants({ size: 'lg', className: 'h-10 w-full' })}
      >
        Go to {household.name}
      </Link>
    </OnboardingLayout>
  );
}
