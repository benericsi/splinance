import { Link } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { promptInstall, useInstallMethod } from '../install';

/** In the account menu, only where the app can be installed and is not already. */
export function InstallAppItem() {
  const { t } = useTranslation('shell');
  const method = useInstallMethod();
  if (!method) return null;

  return (
    <>
      {method === 'prompt' ? (
        <DropdownMenuItem onClick={() => void promptInstall()}>
          <Download aria-hidden />
          {t('install.item')}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          render={
            <Link
              to="."
              search={(prev) => ({ ...prev, modal: 'install-app' as const })}
              state={OPEN_MODAL_STATE}
            />
          }
        >
          <Download aria-hidden />
          {t('install.item')}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
    </>
  );
}
