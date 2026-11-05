import type { User } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LanguageSwitch } from '@/features/account/components/language-switch';
import { useEndDemo } from '@/features/demo/hooks';
import { useLogout } from '../hooks';

export function UserMenu({ user }: { user: User }) {
  const { t } = useTranslation(['shell', 'common']);
  const logout = useLogout();
  const endDemo = useEndDemo();
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('accountMenu')}
        className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-foreground font-medium">{user.displayName}</div>
            <div className="text-muted-foreground truncate text-xs font-normal">
              {__DEMO_SITE__ ? t('demoAccount') : user.email}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {!__DEMO_SITE__ && (
          <>
            <DropdownMenuItem render={<Link to="/account" />}>
              <UserRound aria-hidden />
              {t('accountSettings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <div className="flex items-center justify-between gap-4 px-2 py-1">
          <span className="text-sm">{t('common:theme.label')}</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between gap-4 px-2 py-1">
          <span className="text-sm">{t('common:language')}</span>
          <LanguageSwitch />
        </div>
        <DropdownMenuSeparator />
        {__DEMO_SITE__ ? (
          // Demo accounts have no password: leaving means the household is gone.
          <DropdownMenuItem
            onClick={() => {
              setConfirmingEnd(true);
            }}
          >
            <LogOut aria-hidden />
            {t('endDemo')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate();
            }}
          >
            <LogOut aria-hidden />
            {t('logOut')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
      {__DEMO_SITE__ && (
        <ConfirmDialog
          open={confirmingEnd}
          onOpenChange={setConfirmingEnd}
          title={t('endDemoTitle')}
          description={t('endDemoDescription')}
          confirmLabel={t('endDemo')}
          pendingLabel={t('ending')}
          destructive
          pending={endDemo.isPending}
          onConfirm={() => {
            endDemo.mutate();
          }}
        />
      )}
    </DropdownMenu>
  );
}
