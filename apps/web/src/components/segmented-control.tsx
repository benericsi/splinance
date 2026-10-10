import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Type". */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode }[];
  className?: string;
}

/**
 * Exactly one of a few options, side by side (Expense / Income, Shared / Just me). A toggle
 * group that cannot be emptied: pressing the active option keeps it selected.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next: unknown[]) => {
        const selected = options.find((option) => next.includes(option.value));
        if (selected) onChange(selected.value);
      }}
      spacing={0.5}
      className={cn('bg-muted w-full rounded-lg p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground hover:text-foreground h-8 flex-1 hover:bg-transparent aria-pressed:shadow-sm dark:aria-pressed:bg-input/50"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
