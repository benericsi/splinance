import { useNavigate } from '@tanstack/react-router';
import { Share, SquarePlus } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteDialog } from '@/components/route-dialog';
import { useCloseModal } from '@/lib/route-modal';

/**
 * iOS has no install prompt, so this says where to find it. Opened from the account menu
 * with `?modal=install-app` (see the _authenticated layout).
 */
export function InstallAppDialog() {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '.', search: (prev) => ({ ...prev, modal: undefined }), replace: true });
    }, [navigate]),
  );

  return (
    <RouteDialog title={t('install.title')} description={t('install.description')} onClose={close}>
      <ol className="space-y-3">
        <li className="flex items-center gap-3">
          <Share className="text-muted-foreground size-5 shrink-0" aria-hidden />
          {t('install.share')}
        </li>
        <li className="flex items-center gap-3">
          <SquarePlus className="text-muted-foreground size-5 shrink-0" aria-hidden />
          {t('install.add')}
        </li>
      </ol>
    </RouteDialog>
  );
}
