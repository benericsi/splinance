import type { Household } from '@splinance/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { HouseholdAvatar } from '@/components/household-avatar';
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

export function HouseholdSwitcher({
  current,
  className,
}: {
  current: Pick<Household, 'id' | 'name'>;
  className?: string;
}) {
  const { data: households = [] } = useQuery(householdQueries.list());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'hover:bg-accent data-popup-open:bg-accent focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]',
          className,
        )}
      >
        <HouseholdAvatar household={current} size={28} decorative />
        <span className="min-w-0 flex-1 truncate font-medium">{current.name}</span>
        <span className="sr-only">, switch household</span>
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
