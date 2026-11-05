import { Contrast, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ThemePreference, themeStore, useTheme } from '@/lib/theme';

const OPTIONS: { value: ThemePreference; Icon: typeof Sun }[] = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Contrast },
];

/** Segmented light / dark / system control: pill track, raised active item, tooltip labels. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference } = useTheme();

  return (
    <ToggleGroup
      aria-label={t('theme.label')}
      value={[preference]}
      onValueChange={(value) => {
        // Single selection: clicking the active item reports [], keep the current one.
        const next = OPTIONS.find((o) => o.value === value[0]);
        if (next) themeStore.setPreference(next.value);
      }}
      spacing={0.5}
      className="bg-muted rounded-full p-1"
    >
      {OPTIONS.map(({ value, Icon }) => {
        const label = t(`theme.${value}`);
        return (
          <Tooltip key={value}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value={value}
                  aria-label={label}
                  className="text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground size-7 min-w-7 rounded-full p-0 hover:bg-transparent aria-pressed:shadow-sm"
                >
                  <Icon className="size-4" aria-hidden />
                </ToggleGroupItem>
              }
            />
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
