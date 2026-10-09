import type { Household } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { House, type LucideIcon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { UserMenu } from '@/features/auth/components/user-menu';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { HouseholdSwitcher } from './household-switcher';

interface NavItem {
  to: '/h/$householdId' | '/h/$householdId/settings';
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

// New sections (expenses, balances, budgets, ...) are added here as they ship.
const NAV_ITEMS: NavItem[] = [
  { to: '/h/$householdId', label: 'Overview', icon: House, exact: true },
  { to: '/h/$householdId/settings', label: 'Settings', icon: Settings },
];

function NavLinks({ householdId, variant }: { householdId: string; variant: 'sidebar' | 'tabs' }) {
  return NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
    <Link
      key={to}
      to={to}
      params={{ householdId }}
      activeOptions={{ exact: exact ?? false }}
      className={cn(
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
        variant === 'sidebar'
          ? 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground flex items-center gap-3 rounded-lg px-3 py-2 font-medium'
          : 'text-muted-foreground data-[status=active]:text-foreground flex flex-col items-center gap-1 py-2 text-xs font-medium',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  ));
}

/**
 * Layout for everything inside a household. Desktop: sidebar with the switcher and
 * sections; the account menu sits top right, level with the page heading. Phones: a top
 * bar with the switcher and account menu, sections as a bottom tab bar.
 */
export function HouseholdShell({
  household,
  children,
}: {
  household: Pick<Household, 'id' | 'name'>;
  children: ReactNode;
}) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-svh">
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-16 items-center px-5">
          <Logo className="text-lg [&_svg]:size-7" />
        </div>
        <div className="px-3">
          <HouseholdSwitcher current={household} />
        </div>
        <nav aria-label="Household sections" className="mt-4 flex flex-col gap-0.5 px-3">
          <NavLinks householdId={household.id} variant="sidebar" />
        </nav>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:absolute md:top-8 md:right-8 md:h-auto md:border-0 md:p-0">
          <div className="min-w-0 md:hidden">
            <HouseholdSwitcher current={household} />
          </div>
          {user && <UserMenu user={user} />}
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-12">
          {children}
        </main>

        <nav
          aria-label="Household sections"
          className="bg-background fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <NavLinks householdId={household.id} variant="tabs" />
        </nav>
      </div>
    </div>
  );
}
