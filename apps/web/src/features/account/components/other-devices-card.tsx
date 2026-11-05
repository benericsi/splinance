import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { useRevokeOtherSessions } from '../hooks';

/** Signs out every other session (a lost phone, a shared computer); this one stays. */
export function OtherDevicesCard() {
  const { t } = useTranslation('account');
  const revoke = useRevokeOtherSessions();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <CardTitle>{t('devices.title')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('devices.description')}</p>
        </div>
        <Button
          variant="outline"
          disabled={revoke.isPending}
          onClick={() => {
            revoke.mutate(undefined, {
              onSuccess: (revoked) => {
                toast.success(
                  revoked === 0 ? t('devices.none') : t('devices.signedOut', { count: revoked }),
                );
              },
            });
          }}
        >
          {revoke.isPending ? t('devices.signingOut') : t('devices.signOut')}
        </Button>
      </CardContent>
    </Card>
  );
}
