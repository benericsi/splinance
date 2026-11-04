import { oauthErrorCodeSchema } from '@splinance/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { FormError } from '@/components/form/form-error';
import { PageTitle } from '@/components/page-title';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { LinkNotice } from '@/features/auth/components/link-notice';
import { LoginForm } from '@/features/auth/components/login-form';
import { ProviderButtons } from '@/features/auth/components/provider-buttons';
import { OAUTH_ERROR_MESSAGES, PROVIDER_VIEWS } from '@/features/auth/providers';
import { authQueries } from '@/features/auth/queries';
import { useSignInProviders } from '@/features/auth/use-sign-in-providers';
import { DEMO_URL } from '@/lib/demo-site';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';

/**
 * Besides `redirect`, a provider sign-in comes back with `oauth_error=<code>` or with
 * `oauth=link` (connect to the existing account). Unknown values are dropped.
 */
const loginSearchSchema = redirectSearchSchema.extend({
  oauth_error: oauthErrorCodeSchema.optional().catch(undefined),
  oauth: z.literal('link').optional().catch(undefined),
});

export const Route = createFileRoute('/_auth/login')({
  validateSearch: loginSearchSchema,
  loaderDeps: ({ search }) => ({ link: search.oauth === 'link' }),
  // Awaited so the buttons are there on first paint. Errors are swallowed: a failed list
  // just leaves the password form, an expired link the normal page.
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.query(authQueries.providers()).catch(() => undefined),
      deps.link && context.queryClient.query(authQueries.pendingLink()).catch(() => undefined),
    ]),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target, oauth_error: oauthError, oauth } = Route.useSearch();
  const navigate = Route.useNavigate();
  const providers = useSignInProviders();
  const pendingLink = useQuery({ ...authQueries.pendingLink(), enabled: oauth === 'link' });
  const link = oauth === 'link' ? pendingLink.data : undefined;

  // Shown once: the code leaves the URL, so a reload or going back does not repeat it.
  const [shownError] = useState(oauthError);
  useEffect(() => {
    if (oauthError) {
      void navigate({ search: (prev) => ({ ...prev, oauth_error: undefined }), replace: true });
    }
  }, [oauthError, navigate]);

  const firstProvider = providers[0] && PROVIDER_VIEWS[providers[0].id];
  const passwordHint =
    firstProvider && !link
      ? `Signed up with ${firstProvider.name}? Use the button above.`
      : undefined;

  return (
    <>
      <PageTitle title="Log in" />
      <AuthLayout
        title="Log in"
        description="Welcome back to Splinance."
        aside={
          <>
            No account yet?{' '}
            <Link
              to="/register"
              search={{ redirect: target }}
              className="text-link font-medium underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </>
        }
      >
        {shownError && (
          <div className="mb-4">
            <FormError message={OAUTH_ERROR_MESSAGES[shownError]} />
          </div>
        )}
        {link ? <LinkNotice providerId={link.provider} /> : <ProviderButtons redirect={target} />}
        <LoginForm
          key={link?.email ?? 'login'}
          linkEmail={link?.email}
          passwordHint={passwordHint}
          onSuccess={() => void navigate({ href: safeRedirect(target), replace: true })}
        />
        {DEMO_URL && (
          <p className="text-muted-foreground mt-6 text-center text-sm">
            Just looking?{' '}
            <a href={DEMO_URL} className="text-link font-medium underline-offset-4 hover:underline">
              Try the demo
            </a>
          </p>
        )}
      </AuthLayout>
    </>
  );
}
