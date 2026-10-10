import type { Household } from '@splinance/shared';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Check, ChevronsUpDown, type LucideIcon, Plus, Settings } from 'lucide-react';
import { HouseholdAvatar } from '@/components/household-avatar';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSearchInput,
  ComboboxSeparator,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { householdQueries } from '../queries';

/** From this many households on, the switcher gets a search box; below, it is a plain menu. */
export const SEARCH_FROM_HOUSEHOLDS = 5;

type CurrentHousehold = Pick<Household, 'id' | 'name'>;

const triggerClass =
  'hover:bg-accent data-popup-open:bg-accent focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]';

function TriggerContent({ current }: { current: CurrentHousehold }) {
  return (
    <>
      <HouseholdAvatar household={current} size={28} decorative />
      <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
      <span className="sr-only">, switch household</span>
    </>
  );
}

export function HouseholdSwitcher({
  current,
  className,
}: {
  current: CurrentHousehold;
  className?: string;
}) {
  const { data: households = [] } = useQuery(householdQueries.list());
  return households.length >= SEARCH_FROM_HOUSEHOLDS ? (
    <SearchableSwitcher current={current} households={households} className={className} />
  ) : (
    <MenuSwitcher current={current} households={households} className={className} />
  );
}

/** A few households: a menu, as there is nothing to search. */
function MenuSwitcher({
  current,
  households,
  className,
}: {
  current: CurrentHousehold;
  households: Household[];
  className?: string | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClass, className)}>
        <TriggerContent current={current} />
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Households</DropdownMenuLabel>
          {households.map((household) => (
            <DropdownMenuItem
              key={household.id}
              render={<Link to="/h/$householdId" params={{ householdId: household.id }} />}
            >
              <HouseholdAvatar household={household} size={20} decorative />
              <span className="min-w-0 flex-1 truncate">{household.name}</span>
              {household.id === current.id && <Check aria-label="Current household" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link
              to="."
              search={(prev) => ({ ...prev, modal: 'new-household' as const })}
              state={OPEN_MODAL_STATE}
            />
          }
        >
          <Plus aria-hidden />
          New household
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link to="/h/$householdId/settings" params={{ householdId: current.id }} />}
        >
          <Settings aria-hidden />
          Household settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Rows of the searchable switcher: households are filtered, actions always stay. */
type Option =
  | { type: 'household'; id: string; name: string; household: Household }
  | { type: 'action'; id: 'new' | 'settings'; name: string; icon: LucideIcon };

interface OptionGroup {
  value: string;
  items: Option[];
}

/** Many households: the same entries with a search box (accent and case insensitive). */
function SearchableSwitcher({
  current,
  households,
  className,
}: {
  current: CurrentHousehold;
  households: Household[];
  className?: string | undefined;
}) {
  const navigate = useNavigate();
  // Accent and case insensitive (Intl.Collator), the same matching as the category picker.
  const { contains } = ComboboxPrimitive.useFilter();
  const [query, setQuery] = useState('');
  const noMatch = query.trim() !== '' && !households.some((h) => contains(h.name, query));
  const householdOptions: Option[] = households.map((household) => ({
    type: 'household',
    id: household.id,
    name: household.name,
    household,
  }));
  const actions: Option[] = [
    { type: 'action', id: 'new', name: 'New household', icon: Plus },
    { type: 'action', id: 'settings', name: 'Household settings', icon: Settings },
  ];
  const groups: OptionGroup[] = [
    { value: 'Households', items: householdOptions },
    { value: 'Actions', items: actions },
  ];
  const selected = householdOptions.find((option) => option.id === current.id) ?? null;

  const choose = (option: Option | null) => {
    if (!option) return;
    if (option.type === 'household') {
      if (option.id !== current.id) {
        void navigate({ to: '/h/$householdId', params: { householdId: option.id } });
      }
    } else if (option.id === 'new') {
      void navigate({
        to: '.',
        search: (prev) => ({ ...prev, modal: 'new-household' as const }),
        state: OPEN_MODAL_STATE,
      });
    } else {
      void navigate({ to: '/h/$householdId/settings', params: { householdId: current.id } });
    }
  };

  return (
    <Combobox
      items={groups}
      value={selected}
      onValueChange={choose}
      onInputValueChange={setQuery}
      itemToStringLabel={(option: Option) => option.name}
      itemToStringValue={(option: Option) => option.id}
      // The first match is highlighted while typing, so Enter picks it.
      autoHighlight
      isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}
      // The search narrows households only; the actions are always reachable.
      filter={(option: Option, query: string) =>
        option.type === 'action' || contains(option.name, query)
      }
    >
      <ComboboxTrigger
        className={cn(triggerClass, '[&>svg]:hidden', className)}
        aria-label={`${current.name}, switch household`}
      >
        <TriggerContent current={current} />
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </ComboboxTrigger>
      <ComboboxContent className="min-w-64">
        <ComboboxSearchInput placeholder="Search households" aria-label="Search households" />
        {/* The actions never filter out, so the list is never empty: say so explicitly. */}
        {noMatch && (
          <p role="status" className="text-muted-foreground px-3 pt-2 text-sm">
            No households match
          </p>
        )}
        <ComboboxList>
          {(group: OptionGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              {group.value === 'Households' ? (
                <ComboboxLabel>Households</ComboboxLabel>
              ) : (
                <ComboboxSeparator />
              )}
              <ComboboxCollection>
                {(option: Option) => (
                  <ComboboxItem key={option.id} value={option} className="gap-2.5 py-1.5">
                    {option.type === 'household' ? (
                      <HouseholdAvatar household={option.household} size={20} decorative />
                    ) : (
                      <option.icon aria-hidden />
                    )}
                    <span className="min-w-0 truncate">{option.name}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
