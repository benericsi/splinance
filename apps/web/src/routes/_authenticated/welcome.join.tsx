import { revalidateLogic, useForm } from '@tanstack/react-form';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
import { stashInviteToken } from '@/features/invites/pending-invite';
import { BackLink } from '@/features/onboarding/components/back-link';
import { OnboardingLayout } from '@/features/onboarding/components/onboarding-layout';
import { joinLinkInputSchema } from '@/features/onboarding/join-link';

/** Join path: paste the link, then the regular invite page takes over. */
export const Route = createFileRoute('/_authenticated/welcome/join')({
  component: JoinStep,
});

function JoinStep() {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: { link: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: joinLinkInputSchema },
    onSubmit: async ({ value }) => {
      const { link: token } = joinLinkInputSchema.parse(value);
      // Same path as opening the link: the token goes to sessionStorage, not into a URL query.
      if (stashInviteToken(token)) await navigate({ to: '/invite' });
      else await navigate({ to: '/invite', hash: token });
    },
  });

  return (
    <OnboardingLayout
      step={2}
      steps={2}
      title="Join with an invite link"
      description="Paste the link someone sent you. You'll see the household before you join."
      footer={<BackLink />}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="link">
          {(field) => (
            <TextField
              field={field}
              required
              label="Invite link"
              placeholder="https://splinance.hu/invite#…"
              autoComplete="off"
              autoFocus
            />
          )}
        </form.Field>
        <Button type="submit" size="lg" className="h-10 w-full">
          Continue
        </Button>
      </form>
    </OnboardingLayout>
  );
}
