import { Link } from '@tanstack/react-router';
import { PiggyBank, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Phones only: the bottom bar has no room for a seventh tab, so savings shares the Budgets
 * tab, and this switch moves between the two (like `ActivityViewSwitch` for the calendar).
 * Links, not buttons: each is a page of its own.
 */
export function SavingsViewSwitch({
  householdId,
  active,
}: {
  householdId: string;
  active: 'budgets' | 'savings';
}) {
  const { t } = useTranslation('savings');
  const item = (current: boolean) =>
    cn(
      'focus-visible:ring-ring/50 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px]',
      current
        ? 'bg-background text-foreground dark:bg-input/50 shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );
  return (
    <nav
      aria-label={t('switch.label')}
      className="bg-muted mb-4 flex gap-0.5 rounded-lg p-0.5 md:hidden"
    >
      <Link
        to="/h/$householdId/budgets"
        params={{ householdId }}
        aria-current={active === 'budgets' ? 'page' : undefined}
        className={item(active === 'budgets')}
      >
        <PiggyBank className="size-4" aria-hidden />
        {t('switch.budgets')}
      </Link>
      <Link
        to="/h/$householdId/savings"
        params={{ householdId }}
        aria-current={active === 'savings' ? 'page' : undefined}
        className={item(active === 'savings')}
      >
        <Target className="size-4" aria-hidden />
        {t('switch.savings')}
      </Link>
    </nav>
  );
}
