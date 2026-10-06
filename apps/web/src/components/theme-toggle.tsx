import { Contrast, Moon, Sun } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ThemePreference, themeStore, useTheme } from '@/lib/theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Contrast },
];

/** Segmented light / dark / system control: pill track, raised active item, tooltip labels. */
export function ThemeToggle() {
  const { preference } = useTheme();

  return (
    <ToggleGroup
      aria-label="Theme"
      value={[preference]}
      onValueChange={(value) => {
        // Single selection: clicking the active item reports [], keep the current one.
        const next = OPTIONS.find((o) => o.value === value[0]);
        if (next) themeStore.setPreference(next.value);
      }}
      spacing={0.5}
      className="bg-muted rounded-full p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
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
      ))}
    </ToggleGroup>
  );
}
