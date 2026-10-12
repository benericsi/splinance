import type { HouseholdDetail, Settlement } from '@splinance/shared';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Ellipsis, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDayHeading } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { COLLAPSE } from '@/lib/motion';
import { describePayment } from '../debts';
import { useDeleteSettlement, useRestoreSettlement } from '../hooks';
import { balanceQueries } from '../queries';

/** Recorded payments, newest first, with delete (and undo) for the people allowed to. */
export function SettlementList({
  household,
  viewerId,
}: {
  household: HouseholdDetail;
  viewerId: string;
}) {
  const list = useSuspenseInfiniteQuery(balanceQueries.settlements(household.id));
  // Here, not in the row: the row unmounts once the refetch drops it, and per-call
  // `mutate` callbacks of an unmounted component never run (no undo toast).
  const remove = useDeleteSettlement();
  const restore = useRestoreSettlement();
  const settlements = list.data.pages.flatMap((page) => page.settlements);
  if (settlements.length === 0) return null;

  const deleteSettlement = (settlement: Settlement) => {
    const ref = { householdId: household.id, settlementId: settlement.id };
    remove.mutate(ref, {
      onSuccess: () => {
        toast('Payment deleted', {
          // Like transactions: an undo needs time to notice and reach.
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: () => {
              restore.mutate(ref);
            },
          },
        });
      },
    });
  };

  // Mirrors the API rule: the two people, whoever recorded it, or an owner.
  const mayDelete = (settlement: Settlement) =>
    household.role === 'owner' ||
    [settlement.from.userId, settlement.to.userId, settlement.createdBy.userId].includes(viewerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent settlements</CardTitle>
      </CardHeader>
      <CardContent>
        <ul>
          <AnimatePresence initial={false}>
            {settlements.map((settlement) => (
              // A divider between rows, not under the last one.
              <m.li key={settlement.id} {...COLLAPSE} className="not-last:border-b">
                <div className="flex min-h-12 items-center gap-3 py-2">
                  <ArrowLeftRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {describePayment(settlement.from, settlement.to, viewerId)}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {formatDayHeading(settlement.settledOn)}
                      {settlement.note ? ` · ${settlement.note}` : ''}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">
                    {formatMoney(settlement.amount, settlement.currency)}
                  </span>
                  {mayDelete(settlement) ? (
                    <SettlementActions
                      onDelete={() => {
                        deleteSettlement(settlement);
                      }}
                    />
                  ) : (
                    <span className="size-8 shrink-0" aria-hidden />
                  )}
                </div>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
        {list.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettlementActions({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Payment actions" />}
      >
        <Ellipsis aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
