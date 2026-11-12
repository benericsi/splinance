import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { hideAmountsStore, useHideAmounts } from '@/lib/hide-amounts';
import { cn } from '@/lib/utils';

/**
 * The eye beside the notification bell: blurs every amount on this device until pressed
 * again (before sharing a screen). Same as the switch in Preferences.
 */
export function HideAmountsToggle() {
  const { t } = useTranslation('shell');
  const hidden = useHideAmounts();
  const Icon = hidden ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label={t('hideAmounts')}
      aria-pressed={hidden}
      title={t('hideAmounts')}
      onClick={() => {
        hideAmountsStore.setHidden(!hidden);
      }}
      // Same size and fill as the bell next to it.
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'bg-muted/70 hover:bg-muted size-9 rounded-full [&_svg]:size-5',
        hidden && 'text-foreground',
      )}
    >
      <Icon aria-hidden />
    </button>
  );
}
