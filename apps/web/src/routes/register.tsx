import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { AuthCard } from '@/features/auth/components/auth-card';
import { RegisterForm } from '@/features/auth/components/register-form';
import { redirectSearchSchema, safeRedirect } from '@/lib/safe-redirect';

export const Route = createFileRoute('/register')({
  validateSearch: redirectSearchSchema,
  beforeLoad: ({ context, search }) => {
    if (context.auth.getState().status === 'authenticated') {
      throw redirect({ href: safeRedirect(search.redirect) });
    }
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <AuthCard
      title="Create your account"
      description="Track personal and shared expenses in one place."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" search={{ redirect: target }} className="text-foreground underline">
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm
        onSuccess={() => void navigate({ href: safeRedirect(target), replace: true })}
      />
    </AuthCard>
  );
}
