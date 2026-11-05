import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { LanguageSwitch } from './language-switch';

/** The UI language, saved to the account so every device follows it. */
export function LanguageCard() {
  const { t } = useTranslation('account');

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <CardTitle>{t('language.title')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('language.description')}</p>
        </div>
        <LanguageSwitch />
      </CardContent>
    </Card>
  );
}
