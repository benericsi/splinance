import { LOCALE_NAMES, LOCALES } from '@splinance/shared';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { useSaveLocale } from '../hooks';

/**
 * English | Magyar. Each language is named in itself, so people find theirs whatever is on
 * screen; `lang` on each name lets screen readers pronounce it right. `pill` matches the
 * theme toggle in the account menu; `plain` is the quiet version for the auth screens.
 */
export function LanguageSwitch({ variant = 'pill' }: { variant?: 'pill' | 'plain' }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const save = useSaveLocale();

  return (
    <ToggleGroup
      aria-label={t('language')}
      value={[locale]}
      onValueChange={(value) => {
        // Single selection: clicking the active item reports [], keep the current one.
        const next = LOCALES.find((l) => l === value[0]);
        if (next && next !== locale) save.mutate(next);
      }}
      spacing={0.5}
      className={cn(variant === 'pill' && 'bg-muted rounded-full p-1')}
    >
      {LOCALES.map((option) => (
        <ToggleGroupItem
          key={option}
          value={option}
          lang={option}
          className={cn(
            'text-muted-foreground hover:text-foreground aria-pressed:text-foreground h-7 px-2.5 text-xs hover:bg-transparent',
            variant === 'pill'
              ? 'aria-pressed:bg-background rounded-full aria-pressed:shadow-sm'
              : 'aria-pressed:bg-muted rounded-md',
          )}
        >
          {LOCALE_NAMES[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
