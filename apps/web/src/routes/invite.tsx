import { inviteTokenSchema } from '@splinance/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { PageTitle } from '@/components/page-title';
import { Button, buttonVariants } from '@/components/ui/button';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { useLogout } from '@/features/auth/hooks';
import { useAcceptInvite } from '@/features/invites/hooks';
import { expiresIn } from '@/features/invites/format';
import { inviteProblem } from '@/features/invites/invite-errors';
import {
  clearInviteToken,
  readInviteToken,
  stashInviteToken,
} from '@/features/invites/pending-invite';
import { inviteQueries } from '@/features/invites/queries';
import { useAuth } from '@/lib/auth-store';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';

/** Public landing page for invite links: `/invite#<token>`. Works logged in or out. */
export const Route = createFileRoute('/invite')({
  component: InvitePage,
});

const validToken = (value: string | undefined) =>
  value && inviteTokenSchema.safeParse(value).success ? value : undefined;

function InvitePage() {
  const hash = useLocation({ select: (location) => location.hash });
  const navigate = useNavigate();
  // From the link itself, or, after a detour through login/register, from this tab's storage.
  const [token] = useState(() => validToken(hash) ?? validToken(readInviteToken()));

  useEffect(() => {
    // Keep the token out of the address bar and history once it is stored safely.
    if (token && hash && stashInviteToken(token)) {
      void navigate({ to: '/invite', hash: '', replace: true });
    }
  }, [token, hash, navigate]);

  const preview = useQuery({ ...inviteQueries.preview(token ?? ''), enabled: token !== undefined });

  if (!token) {
    return (
      <InviteLayout
        title="This invite link is incomplete"
        description="Open the full link you received, or ask for a new one."
      >
        <HomeLink />
      </InviteLayout>
    );
  }

  if (preview.isPending) {
    return <InviteLayout title="Opening your invite" description="One moment." />;
  }

  if (preview.isError) {
    const problem = inviteProblem(preview.error);
    return (
      <InviteLayout title={problem.title} description={problem.description}>
        <HomeLink />
      </InviteLayout>
    );
  }

  const invite = preview.data;
  return (
    <InviteLayout
      title={`Join ${invite.householdName}`}
      description={`${invite.invitedBy.displayName} invited you to share expenses in ${invite.householdName}. The invite expires ${expiresIn(invite.expiresAt)}.`}
    >
      <JoinActions token={token} householdName={invite.householdName} />
    </InviteLayout>
  );
}

function JoinActions({ token, householdName }: { token: string; householdName: string }) {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const logout = useLogout();

  if (status !== 'authenticated') {
    // Only `/invite` travels through login: the token stays in sessionStorage.
    return (
      <div className="space-y-3">
        <Link
          to="/login"
          search={{ redirect: '/invite' }}
          className={buttonVariants({ size: 'lg', className: 'h-10 w-full' })}
        >
          Log in to join
        </Link>
        <Link
          to="/register"
          search={{ redirect: '/invite' }}
          className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-10 w-full' })}
        >
          Create an account
        </Link>
      </div>
    );
  }

  const alreadyMember = accept.error instanceof ApiError && accept.error.code === 'ALREADY_MEMBER';

  if (alreadyMember) {
    return (
      <div className="space-y-4">
        <FormError message={`You're already a member of ${householdName}.`} />
        <HomeLink label="Open Splinance" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormError message={accept.error ? inviteErrorMessage(accept.error) : undefined} />
      <Button
        size="lg"
        className="h-10 w-full"
        disabled={accept.isPending}
        onClick={() => {
          accept.mutate(
            { token },
            {
              onSuccess: (household) => {
                clearInviteToken();
                toast.success(`Welcome to ${household.name}`);
                void navigate({
                  to: '/h/$householdId',
                  params: { householdId: household.id },
                  replace: true,
                });
              },
              onError: (error) => {
                if (error instanceof ApiError && error.code === 'ALREADY_MEMBER') {
                  clearInviteToken();
                }
              },
            },
          );
        }}
      >
        {accept.isPending ? 'Joining…' : `Join ${householdName}`}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Joining as {user?.displayName}.{' '}
        <button
          type="button"
          className="text-link font-medium underline-offset-4 hover:underline"
          onClick={() => {
            logout.mutate();
          }}
        >
          Not you? Log out
        </button>
      </p>
    </div>
  );
}

function inviteErrorMessage(error: unknown): string {
  const problem = inviteProblem(error);
  return error instanceof ApiError && error.code.startsWith('INVITE_')
    ? `${problem.title}. ${problem.description}`
    : errorMessage(error);
}

function InviteLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageTitle title="Join a household" />
      <AuthLayout title={title} description={description} aside={null}>
        {children}
      </AuthLayout>
    </>
  );
}

function HomeLink({ label = 'Go to Splinance' }: { label?: string }) {
  return (
    <Link
      to="/"
      className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-10 w-full' })}
    >
      {label}
    </Link>
  );
}
