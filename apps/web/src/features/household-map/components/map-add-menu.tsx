import type { HouseholdDetail } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { FileUp, HandCoins, Plus, Receipt, Repeat, Target, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';

/**
 * Everything that can be put on the map, from the map: each item opens the dialog or page
 * that already does it. Closing a dialog comes back here.
 */
export function MapAddMenu({ household }: { household: HouseholdDetail }) {
  const { t } = useTranslation('map');
  const params = { householdId: household.id };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="bg-card" />}>
        <Plus aria-hidden />
        {t('add.label')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem
          render={
            <Link to="/h/$householdId/transactions/new" params={params} state={OPEN_MODAL_STATE} />
          }
        >
          <Receipt aria-hidden />
          {t('add.transaction')}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link to="/h/$householdId/transactions/import" params={params} />}
        >
          <FileUp aria-hidden />
          {t('add.import')}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link to="/h/$householdId/recurring/new" params={params} state={OPEN_MODAL_STATE} />
          }
        >
          <Repeat aria-hidden />
          {t('add.recurring')}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link to="/h/$householdId/budgets/set" params={params} state={OPEN_MODAL_STATE} />
          }
        >
          <Target aria-hidden />
          {t('add.budget')}
        </DropdownMenuItem>
        {household.members.length > 1 && (
          <DropdownMenuItem
            render={
              <Link
                to="/h/$householdId/settle"
                params={params}
                search={{ view: 'map' }}
                state={OPEN_MODAL_STATE}
              />
            }
          >
            <HandCoins aria-hidden />
            {t('add.settle')}
          </DropdownMenuItem>
        )}
        {/* Only owners invite. */}
        {household.role === 'owner' && (
          <DropdownMenuItem
            render={
              <Link to="/h/$householdId/settings/invite" params={params} state={OPEN_MODAL_STATE} />
            }
          >
            <UserPlus aria-hidden />
            {t('add.invite')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
