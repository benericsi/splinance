import { inviteTokenSchema } from '@splinance/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('invites');
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
      <InviteLayout title={t('page.incompleteTitle')} description={t('page.incompleteDescription')}>
        <HomeLink />
      </InviteLayout>
    );
  }

  if (preview.isPending) {
    return (
      <InviteLayout title={t('page.openingTitle')} description={t('page.openingDescription')} />
    );
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
      title={t('page.joinTitle', { household: invite.householdName })}
      description={t('page.joinDescription', {
        inviter: invite.invitedBy.displayName,
        household: invite.householdName,
        expires: expiresIn(invite.expiresAt),
      })}
    >
      <JoinActions token={token} householdName={invite.householdName} />
    </InviteLayout>
  );
}

function JoinActions({ token, householdName }: { token: string; householdName: string }) {
  const { t } = useTranslation('invites');
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
          {t('page.logInToJoin')}
        </Link>
        <Link
          to="/register"
          search={{ redirect: '/invite' }}
          className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-10 w-full' })}
        >
          {t('page.createAccount')}
        </Link>
      </div>
    );
  }

  const alreadyMember = accept.error instanceof ApiError && accept.error.code === 'ALREADY_MEMBER';

  if (alreadyMember) {
    return (
      <div className="space-y-4">
        <FormError message={t('page.alreadyMember', { household: householdName })} />
        <HomeLink label={t('page.openApp')} />
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
                toast.success(t('page.welcome', { household: household.name }));
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
        {accept.isPending ? t('page.joining') : t('page.join', { household: householdName })}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        {t('page.joiningAs', { name: user?.displayName ?? '' })}{' '}
        <button
          type="button"
          className="text-link font-medium underline-offset-4 hover:underline"
          onClick={() => {
            logout.mutate();
          }}
        >
          {t('page.notYou')}
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
  const { t } = useTranslation('invites');
  return (
    <>
      <PageTitle title={t('page.pageTitle')} />
      <AuthLayout title={title} description={description} aside={null}>
        {children}
      </AuthLayout>
    </>
  );
}

function HomeLink({ label }: { label?: string }) {
  const { t } = useTranslation('invites');
  return (
    <Link
      to="/"
      className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-10 w-full' })}
    >
      {label ?? t('page.goToApp')}
    </Link>
  );
}
