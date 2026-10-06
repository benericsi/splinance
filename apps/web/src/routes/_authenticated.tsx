import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/features/auth/components/user-menu';
import { useAuth } from '@/lib/auth-store';

/** Pathless layout: every route below it requires a logged-in user. */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.getState().status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = useAuth();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          {user && <UserMenu user={user} />}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </>
  );
}
