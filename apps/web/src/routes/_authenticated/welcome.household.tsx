import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CreateHouseholdForm } from '@/features/households/components/create-household-form';
import { BackLink } from '@/features/onboarding/components/back-link';
import { OnboardingLayout } from '@/features/onboarding/components/onboarding-layout';

/** Step 2: name the household. */
export const Route = createFileRoute('/_authenticated/welcome/household')({
  component: HouseholdStep,
});

function HouseholdStep() {
  const navigate = useNavigate();

  return (
    <OnboardingLayout
      step={2}
      steps={4}
      title="Name your household"
      description="Pick something everyone recognizes. You can rename it later."
      footer={<BackLink />}
    >
      <CreateHouseholdForm
        autoFocus
        onCreated={async (household) => {
          // Replace this step: going back must not offer to create the household again.
          await navigate({
            to: '/welcome/invite',
            search: { household: household.id },
            replace: true,
          });
        }}
      />
    </OnboardingLayout>
  );
}
