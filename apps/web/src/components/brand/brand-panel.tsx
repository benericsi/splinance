import { useTranslation } from 'react-i18next';
import { PosterWall } from '@/components/brand/poster-wall';
import { Logo } from '@/components/logo';

/** Left half of the split screens (auth, invite, onboarding): poster wall and tagline, lg+. */
export function BrandPanel() {
  const { t } = useTranslation();
  return (
    <aside className="bg-background hidden flex-col justify-between gap-8 rounded-2xl p-8 lg:flex">
      <Logo className="self-start" />
      <PosterWall className="flex-1" />
      <div className="space-y-3">
        <p className="font-heading text-4xl leading-[1.05] font-extrabold tracking-tight text-balance">
          {t('tagline.title')}
        </p>
        <p className="text-muted-foreground max-w-md text-base">{t('tagline.description')}</p>
      </div>
    </aside>
  );
}
