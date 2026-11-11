import type {
  Balances,
  BudgetList,
  Category,
  HouseholdDetail,
  RecurringList,
} from '@splinance/shared';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FileUp } from 'lucide-react';
import { type DragEvent, lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { stashImportFile } from '@/features/imports/pending-file';
import { importQueries } from '@/features/imports/queries';
import { inviteQueries } from '@/features/invites/queries';
import { today } from '@/features/transactions/dates';
import { cn } from '@/lib/utils';
import { buildMap } from '../build-map';

const HouseholdMap = lazy(() => import('./household-map'));

/** A file from the desktop, not a card being moved around the canvas. */
const carriesFile = (event: DragEvent) => event.dataTransfer.types.includes('Files');

/**
 * Fills the whole area beside the sidebar, behind the page header (`data-bleed`: see
 * `HouseholdShell`). No ancestor up to `main` may be transformed, or it would fill that.
 */
const BLEED = 'absolute inset-0 -z-10';

/** The map's place while its data or its code loads. */
export function MapSkeleton() {
  return <div data-bleed className={cn(BLEED, 'bg-muted/40')} />;
}

/**
 * The overview as a map. Takes what the overview already loaded and adds the viewer's
 * imports and, for owners, pending invites (they arrive when they arrive: the invite
 * node is the only thing waiting on them).
 */
export function OverviewMap({
  household,
  viewerId,
  balances,
  budgets,
  categories,
  recurring,
}: {
  household: HouseholdDetail;
  viewerId: string;
  balances: Balances;
  budgets: BudgetList;
  categories: Category[];
  recurring: RecurringList;
}) {
  const { data: imports } = useSuspenseQuery(importQueries.list(household.id));
  const { data: invites } = useQuery({
    ...inviteQueries.list(household.id),
    enabled: household.role === 'owner',
  });

  const map = useMemo(
    () =>
      buildMap({
        household,
        viewerId,
        balances,
        budgets,
        categories,
        recurring,
        imports,
        invites: invites ?? [],
        today: today(),
        now: new Date(),
      }),
    [household, viewerId, balances, budgets, categories, recurring, imports, invites],
  );

  const { t } = useTranslation('map');
  const navigate = useNavigate();
  const [dropping, setDropping] = useState(false);

  return (
    // A bank export dropped anywhere on the map goes to the import page, which reads it
    // (the bank is recognized from the file, so there is no node to aim for).
    <div
      data-bleed
      className={BLEED}
      onDragOver={(event) => {
        if (!carriesFile(event)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        if (!carriesFile(event)) return;
        event.preventDefault();
        setDropping(false);
        const file = event.dataTransfer.files[0];
        if (!file) return;
        stashImportFile(household.id, file);
        void navigate({
          to: '/h/$householdId/transactions/import',
          params: { householdId: household.id },
        });
      }}
    >
      <Suspense fallback={<MapSkeleton />}>
        <HouseholdMap map={map} />
      </Suspense>
      <p className="text-muted-foreground pointer-events-none absolute inset-x-24 bottom-4 text-center text-sm">
        {t('hint')}
      </p>
      {dropping && (
        <div className="border-ring bg-background/85 pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 border-2 border-dashed">
          <FileUp className="size-6" aria-hidden />
          <p className="font-medium">{t('drop')}</p>
        </div>
      )}
    </div>
  );
}
