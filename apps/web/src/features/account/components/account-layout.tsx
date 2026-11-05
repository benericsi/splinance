import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui/button';
import { UserMenu } from '@/features/auth/components/user-menu';
import { readLastHousehold } from '@/features/households/last-household';
import { householdQueries } from '@/features/households/queries';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

/**
 * Account pages belong to the person, not to a household: a slim top bar (logo, account
 * menu) and one column of cards, the same on phones (no sidebar, no tabs). The way back
 * sits right above the heading, named after where it leads.
 */
export function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:h-16 md:px-8">
        <Logo className="text-lg [&_svg]:size-7" />
        {user && <UserMenu user={user} />}
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-12 md:px-8 md:pt-6">
        <BackLink userId={user?.id} />
        {children}
      </main>
    </div>
  );
}

/**
 * Back to the household used last (as `/` would open), by name once the list is there;
 * without a household (onboarding) back to `/`, which leads to onboarding.
 */
function BackLink({ userId }: { userId: string | undefined }) {
  const { t } = useTranslation();
  const { data: households } = useQuery({ ...householdQueries.list(), enabled: !!userId });
  const last = userId ? readLastHousehold(userId) : undefined;
  const household = households?.find((h) => h.id === last) ?? households?.[0];
  const className = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2.5 mb-4');

  return household ? (
    <Link to="/h/$householdId" params={{ householdId: household.id }} className={className}>
      <ArrowLeft aria-hidden />
      <span className="truncate">{t('backTo', { name: household.name })}</span>
    </Link>
  ) : (
    <Link to="/" className={className}>
      <ArrowLeft aria-hidden />
      {t('back')}
    </Link>
  );
}
