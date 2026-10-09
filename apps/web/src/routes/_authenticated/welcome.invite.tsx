import type { CreateInviteResponse } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { HouseholdAvatar } from '@/components/household-avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { householdQueries } from '@/features/households/queries';
import { InviteLinkCard } from '@/features/invites/components/invite-link-card';
import { useCreateInvite } from '@/features/invites/hooks';
import { OnboardingLayout } from '@/features/onboarding/components/onboarding-layout';
import { householdStepSearchSchema, loadStepHousehold } from '@/features/onboarding/household-step';

/** Step 3: invite a partner (optional). */
export const Route = createFileRoute('/_authenticated/welcome/invite')({
  validateSearch: householdStepSearchSchema,
  loaderDeps: ({ search }) => ({ householdId: search.household }),
  loader: ({ context: { queryClient }, deps: { householdId } }) =>
    loadStepHousehold(queryClient, householdId),
  component: InviteStep,
});

function InviteStep() {
  const household = Route.useLoaderData();
  // Keep the cache subscription so a rename elsewhere shows up.
  const { data } = useSuspenseQuery(householdQueries.detail(household.id));
  const create = useCreateInvite();
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const next = { to: '/welcome/done', search: { household: data.id } } as const;

  return (
    <OnboardingLayout
      step={3}
      steps={4}
      title="Invite your partner"
      description="Send them a link or let them scan the code. You can also do this later in settings."
      footer={
        created ? (
          <Link {...next} className={buttonVariants({ size: 'lg', className: 'h-10 w-full' })}>
            Continue
          </Link>
        ) : (
          <Link
            {...next}
            className={buttonVariants({ variant: 'ghost', size: 'lg', className: 'h-10 w-full' })}
          >
            Skip for now
          </Link>
        )
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <HouseholdAvatar household={data} size={40} decorative />
          <div className="min-w-0">
            <p className="truncate font-medium">{data.name}</p>
            <p className="text-muted-foreground text-sm">You are the owner</p>
          </div>
        </div>
        {created ? (
          <InviteLinkCard token={created.token} householdName={data.name} />
        ) : (
          <Button
            size="lg"
            className="h-10 w-full"
            disabled={create.isPending}
            onClick={() => {
              create.mutate({ householdId: data.id }, { onSuccess: setCreated });
            }}
          >
            <Link2 aria-hidden />
            {create.isPending ? 'Creating…' : 'Create invite link'}
          </Button>
        )}
      </div>
    </OnboardingLayout>
  );
}
