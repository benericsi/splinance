import { useTranslation } from 'react-i18next';
import { PROVIDER_VIEWS } from '../providers';

/**
 * Shown on /login?oauth=link: the provider account belongs to an email that already has a
 * password account, which connects it only after its password (account takeover guard).
 */
export function LinkNotice({ providerId }: { providerId: string }) {
  const { t } = useTranslation('auth');
  const view = PROVIDER_VIEWS[providerId];
  const name = view?.name ?? providerId;
  return (
    <div
      role="status"
      className="bg-muted/50 mb-6 flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm"
    >
      {view && <view.Logo className="mt-0.5 size-4 shrink-0" />}
      <div className="space-y-0.5">
        <p className="font-medium">{t('provider.linkTitle', { provider: name })}</p>
        <p className="text-muted-foreground">{t('provider.linkDescription', { provider: name })}</p>
      </div>
    </div>
  );
}
