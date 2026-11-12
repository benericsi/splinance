import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * One of a few options on a pill track, like the language and theme switches: for a
 * setting that applies the moment it is picked. Cannot be emptied (pressing the active
 * option keeps it).
 */
export function PillToggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** Accessible name of the group (the row's title). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode }[];
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next: unknown[]) => {
        const selected = options.find((option) => next.includes(option.value));
        if (selected && selected.value !== value) onChange(selected.value);
      }}
      spacing={0.5}
      className="bg-muted rounded-full p-1"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground h-7 rounded-full px-2.5 text-xs hover:bg-transparent aria-pressed:shadow-sm"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
