import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/features/auth/components/user-menu';
import { useAuth } from '@/lib/auth-store';

/**
 * Account pages belong to the person, not to a household: a slim top bar (logo, back,
 * account menu) and one column of cards, the same on phones (no sidebar, no tabs).
 * "Back" goes to `/`, which opens the household used last (or onboarding).
 */
export function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:h-16 md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Logo className="text-lg [&_svg]:size-7" />
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
        </div>
        {user && <UserMenu user={user} />}
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-12 md:px-8 md:pt-10">
        {children}
      </main>
    </div>
  );
}
