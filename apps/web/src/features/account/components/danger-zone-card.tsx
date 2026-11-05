import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';

/** Account deletion, like the household danger zone; the dialog explains what happens. */
export function DangerZoneCard() {
  const { t } = useTranslation('account');
  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">{t('danger.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium">{t('danger.deleteAccount')}</p>
          <p className="text-muted-foreground text-sm">{t('danger.deleteDescription')}</p>
        </div>
        <Link
          to="/account/delete"
          state={OPEN_MODAL_STATE}
          className={cn(buttonVariants({ variant: 'destructive' }))}
        >
          {t('danger.deleteButton')}
        </Link>
      </CardContent>
    </Card>
  );
}
