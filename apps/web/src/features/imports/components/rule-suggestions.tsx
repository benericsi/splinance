import type { Category } from '@splinance/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { useCreateRule } from '@/features/rules/hooks';
import type { RuleSuggestion } from '../suggestions';

/**
 * "Do the same next time?": rules made from the categories picked by hand in this import,
 * all checked. Creating them goes one by one; a text taken in the meantime is skipped.
 */
export function RuleSuggestions({
  householdId,
  suggestions,
  categories,
}: {
  householdId: string;
  suggestions: RuleSuggestion[];
  categories: Category[];
}) {
  const create = useCreateRule();
  const [picked, setPicked] = useState(() => new Set(suggestions.map((s) => s.key)));
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  if (suggestions.length === 0 || done) return null;

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const chosen = suggestions.filter((suggestion) => picked.has(suggestion.key));

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
    setSaving(false);
    setDone(true);
    toast.success(`${String(created)} ${created === 1 ? 'rule' : 'rules'} created`);
  };

  return (
    <section aria-label="Rule suggestions" className="space-y-2 border-t pt-4">
      <h2 className="font-medium">Do the same next time?</h2>
      <ul className="divide-y">
        {suggestions.map((suggestion) => {
          const category = categoryById.get(suggestion.categoryId);
          return (
            <li key={suggestion.key}>
              <label className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={picked.has(suggestion.key)}
                  onChange={(event) => {
                    const next = new Set(picked);
                    if (event.target.checked) next.add(suggestion.key);
                    else next.delete(suggestion.key);
                    setPicked(next);
                  }}
                  className="accent-primary size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  Contains <span className="font-medium">{suggestion.pattern}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <CategoryTile category={category} size="sm" />
                  {category?.name}
                  {suggestion.markShared ? ', shared' : ''}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button
        variant="outline"
        disabled={chosen.length === 0 || saving}
        onClick={() => void createRules()}
      >
        {saving
          ? 'Creating…'
          : `Create ${String(chosen.length)} ${chosen.length === 1 ? 'rule' : 'rules'}`}
      </Button>
    </section>
  );
}
