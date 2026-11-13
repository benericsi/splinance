import type { Category, SavingsGoal } from '@splinance/shared';
import { Target } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { useCreateRule } from '@/features/rules/hooks';
import { useCreateSavingsRule } from '@/features/savings/hooks';
import type { RuleSuggestion, SavingsRuleSuggestion } from '../suggestions';

/**
 * "Do the same next time?": rules made from the categories and goals picked by hand in
 * this import, all checked. Category rules are the household's; savings rules the viewer's
 * own. Creating them goes one by one; a text taken in the meantime is skipped.
 */
export function RuleSuggestions({
  householdId,
  suggestions,
  categories,
  savingsSuggestions = [],
  goals = [],
}: {
  householdId: string;
  suggestions: RuleSuggestion[];
  categories: Category[];
  savingsSuggestions?: SavingsRuleSuggestion[];
  goals?: SavingsGoal[];
}) {
  const { t } = useTranslation('imports');
  const create = useCreateRule();
  const createSavings = useCreateSavingsRule();
  const [picked, setPicked] = useState(
    () => new Set([...suggestions, ...savingsSuggestions].map((s) => s.key)),
  );
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  if ((suggestions.length === 0 && savingsSuggestions.length === 0) || done) return null;

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const chosen = suggestions.filter((suggestion) => picked.has(suggestion.key));
  const chosenSavings = savingsSuggestions.filter((suggestion) => picked.has(suggestion.key));

  const createRules = async () => {
    setSaving(true);
    let created = 0;
    for (const suggestion of chosen) {
      try {
        await create.mutateAsync({
          householdId,
          input: {
            pattern: suggestion.pattern,
            categoryId: suggestion.categoryId,
            markShared: suggestion.markShared,
          },
        });
        created += 1;
      } catch {
        // Taken in the meantime, or the category went away: the others still count.
      }
    }
    for (const suggestion of chosenSavings) {
      try {
        await createSavings.mutateAsync({
          householdId,
          input: { pattern: suggestion.pattern, goalId: suggestion.goalId },
        });
        created += 1;
      } catch {
        // Taken in the meantime, or the goal was closed: the others still count.
      }
    }
    setSaving(false);
    setDone(true);
    toast.success(t('suggestions.created', { count: created }));
  };

  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    setPicked(next);
  };

  const item = (key: string, pattern: string, target: React.ReactNode) => (
    <li key={key}>
      <label className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          checked={picked.has(key)}
          onChange={(event) => {
            toggle(key, event.target.checked);
          }}
          className="accent-primary size-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <Trans
            t={t}
            i18nKey="suggestions.contains"
            values={{ pattern }}
            components={{ strong: <span className="font-medium" /> }}
          />
        </span>
        <span className="flex items-center gap-2 text-sm">{target}</span>
      </label>
    </li>
  );

  const count = chosen.length + chosenSavings.length;
  return (
    <section aria-label={t('suggestions.label')} className="space-y-2 border-t pt-4">
      <h2 className="font-medium">{t('suggestions.title')}</h2>
      <ul className="divide-y">
        {suggestions.map((suggestion) => {
          const category = categoryById.get(suggestion.categoryId);
          return item(
            suggestion.key,
            suggestion.pattern,
            <>
              <CategoryTile category={category} size="sm" />
              {category?.name}
              {suggestion.markShared ? t('suggestions.shared') : ''}
            </>,
          );
        })}
        {savingsSuggestions.map((suggestion) =>
          item(
            suggestion.key,
            suggestion.pattern,
            <>
              <Target className="text-muted-foreground size-4" aria-hidden />
              {t('suggestions.toGoal', { goal: goalById.get(suggestion.goalId)?.name ?? '' })}
            </>,
          ),
        )}
      </ul>
      <Button variant="outline" disabled={count === 0 || saving} onClick={() => void createRules()}>
        {saving ? t('suggestions.creating') : t('suggestions.create', { count })}
      </Button>
    </section>
  );
}
