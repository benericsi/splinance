import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Account settings in two pages: links, not tabs in one page, so each has its own URL and
 * the back button works. Not on the demo: it has no account page, only preferences.
 */
export function AccountTabs({ current }: { current: 'account' | 'preferences' }) {
  const { t } = useTranslation('account');
  const item = (active: boolean) =>
    cn(
      'focus-visible:ring-ring/50 -mb-px border-b-2 px-0.5 pb-2 text-sm font-medium outline-none focus-visible:ring-[3px]',
      active
        ? 'border-foreground text-foreground'
        : 'text-muted-foreground hover:text-foreground border-transparent',
    );

  return (
    <nav aria-label={t('tabs.label')} className="-mt-4 mb-6 flex gap-6 border-b">
      <Link
        to="/account"
        aria-current={current === 'account' ? 'page' : undefined}
        className={item(current === 'account')}
      >
        {t('tabs.account')}
      </Link>
      <Link
        to="/account/preferences"
        aria-current={current === 'preferences' ? 'page' : undefined}
        className={item(current === 'preferences')}
      >
        {t('tabs.preferences')}
      </Link>
    </nav>
  );
}
