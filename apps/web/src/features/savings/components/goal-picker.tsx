import type { SavingsGoal } from '@splinance/shared';
import { Lock, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearchInput,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { compareNames } from '@/lib/locale';
import { cn } from '@/lib/utils';

/**
 * A searchable goal select for dense rows (the import review), shaped like `CategoryPicker`
 * so the two can stand in for each other. `value` is a goal id, '' until one is picked;
 * private goals carry a lock.
 */
export function GoalPicker({
  id,
  goals,
  value,
  onChange,
  label,
  invalid = false,
}: {
  id: string;
  /** Already narrowed to what may be picked (open goals). */
  goals: SavingsGoal[];
  value: string;
  onChange: (goalId: string) => void;
  /** For pickers without a visible <label> (rows of a table). */
  label: string;
  /** Marks the trigger when a goal is still missing. */
  invalid?: boolean;
}) {
  const { t } = useTranslation('savings');
  const options = [...goals].sort((a, b) => compareNames(a.name, b.name));
  const selected = options.find((goal) => goal.id === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(goal: SavingsGoal | null) => {
        onChange(goal?.id ?? '');
      }}
      itemToStringLabel={(goal: SavingsGoal) => goal.name}
      itemToStringValue={(goal: SavingsGoal) => goal.id}
      autoHighlight
      isItemEqualToValue={(a: SavingsGoal, b: SavingsGoal) => a.id === b.id}
    >
      <ComboboxTrigger
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border bg-transparent px-2 text-left text-sm outline-none focus-visible:ring-3 aria-invalid:ring-3 [&>svg]:shrink-0"
      >
        <Target className="text-muted-foreground size-4" aria-hidden />
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
          {selected?.name ?? t('picker.placeholder')}
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="min-w-56">
        <ComboboxSearchInput placeholder={t('picker.search')} aria-label={t('picker.search')} />
        <ComboboxEmpty>{t('picker.noMatch')}</ComboboxEmpty>
        <ComboboxList>
          {(goal: SavingsGoal) => (
            <ComboboxItem key={goal.id} value={goal} className="gap-2.5 py-1.5">
              <Target className="text-muted-foreground size-4" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{goal.name}</span>
              {goal.visibility === 'private' && (
                <Lock className="text-muted-foreground size-3.5" aria-label={t('picker.private')} />
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
