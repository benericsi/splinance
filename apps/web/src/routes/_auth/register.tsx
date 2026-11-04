import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { ProviderButtons } from '@/features/auth/components/provider-buttons';
import { RegisterForm } from '@/features/auth/components/register-form';
import { authQueries } from '@/features/auth/queries';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';
import { PageTitle } from '@/components/page-title';

export const Route = createFileRoute('/_auth/register')({
  validateSearch: redirectSearchSchema,
  // Awaited so "Continue with Google" is there on first paint (a failed list is ignored).
  loader: ({ context }) =>
    context.queryClient.query(authQueries.providers()).catch(() => undefined),
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <>
      <PageTitle title="Create account" />
      <AuthLayout
        title="Create your account"
        description="Track personal and shared expenses in one place."
        aside={
          <>
            Already have an account?{' '}
            <Link
              to="/login"
              search={{ redirect: target }}
              className="text-link font-medium underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </>
        }
      >
        <ProviderButtons redirect={target} />
        <RegisterForm
          onSuccess={() => void navigate({ href: safeRedirect(target), replace: true })}
        />
      </AuthLayout>
    </>
  );
}
