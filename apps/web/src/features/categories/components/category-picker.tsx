import type { Category } from '@splinance/shared';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearchInput,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { CategoryTile } from './category-tile';

/** "No category" is an item like the others, so it can be picked (and found) the same way. */
interface Option {
  id: string;
  name: string;
  category: Category | undefined;
}

const NONE: Option = { id: '', name: 'No category', category: undefined };

/**
 * A searchable category select: the trigger looks like a field, the popup has a search box
 * (accent and case insensitive: "egesz" finds "Egészség") and the categories with their tiles.
 * `value` is a category id, '' for none.
 */
export function CategoryPicker({
  id,
  categories,
  value,
  onChange,
  onBlur,
}: {
  id: string;
  /** Already narrowed to what may be picked (kind, active or current). */
  categories: Category[];
  value: string;
  onChange: (categoryId: string) => void;
  onBlur?: (() => void) | undefined;
}) {
  const options = [
    NONE,
    ...categories.map((category) => ({ id: category.id, name: category.name, category })),
  ];
  const selected = options.find((option) => option.id === value) ?? NONE;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option: Option | null) => {
        onChange(option?.id ?? '');
      }}
      itemToStringLabel={(option: Option) => option.name}
      itemToStringValue={(option: Option) => option.id}
      // The first match is highlighted while typing, so Enter picks it.
      autoHighlight
      isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}
    >
      <ComboboxTrigger
        id={id}
        onBlur={onBlur}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border bg-transparent px-2 text-left text-sm outline-none focus-visible:ring-3 [&>svg]:shrink-0"
      >
        <CategoryTile category={selected.category} size="sm" />
        <span className="min-w-0 flex-1 truncate">{selected.name}</span>
      </ComboboxTrigger>
      <ComboboxContent className="min-w-56">
        <ComboboxSearchInput placeholder="Search categories" aria-label="Search categories" />
        <ComboboxEmpty>No categories match</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.id || 'none'} value={option} className="gap-2.5 py-1.5">
              <CategoryTile category={option.category} size="sm" />
              <span className="min-w-0 truncate">{option.name}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
