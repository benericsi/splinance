import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { AuthCard } from '@/features/auth/components/auth-card';
import { LoginForm } from '@/features/auth/components/login-form';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';

export const Route = createFileRoute('/login')({
  validateSearch: redirectSearchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.auth.getState().status === 'authenticated') {
      throw redirect({ href: safeRedirect(search.redirect) });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <AuthCard
      title="Log in"
      description="Welcome back to Splinance."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" search={{ redirect: target }} className="text-foreground underline">
            Create one
          </Link>
        </>
      }
    >
      <LoginForm onSuccess={() => void navigate({ href: safeRedirect(target), replace: true })} />
    </AuthCard>
  );
}
