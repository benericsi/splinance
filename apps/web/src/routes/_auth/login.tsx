import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AuthLayout } from '@/features/auth/components/auth-layout';
import { LoginForm } from '@/features/auth/components/login-form';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';
import { PageTitle } from '@/components/page-title';

export const Route = createFileRoute('/_auth/login')({
  validateSearch: redirectSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();

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
              className="text-foreground font-medium"
            >
              Create one
            </Link>
          </>
        }
      >
        <LoginForm onSuccess={() => void navigate({ href: safeRedirect(target), replace: true })} />
      </AuthLayout>
    </>
  );
}
