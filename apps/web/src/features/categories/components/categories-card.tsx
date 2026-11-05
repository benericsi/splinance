import type { Category, CategoryKind } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, Pencil, Plus } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Collapse } from '@/components/collapse';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { compareNames } from '@/lib/locale';
import { COLLAPSE } from '@/lib/motion';
import { errorMessage } from '@/lib/query-client';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { useArchiveCategory, useRestoreCategory } from '../hooks';
import { CategoryTile } from './category-tile';

/** Household settings: the categories of one kind at a time, add, edit, archive and restore. */
export function CategoriesCard({
  householdId,
  categories,
}: {
  householdId: string;
  categories: Category[];
}) {
  const { t } = useTranslation('categories');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const active = (k: CategoryKind) =>
    categories
      .filter((c) => c.kind === k && !c.archivedAt)
      .sort((a, b) => compareNames(a.name, b.name));
  const archived = categories
    .filter((c) => c.kind === kind && c.archivedAt)
    .sort((a, b) => compareNames(a.name, b.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardAction>
          <Link
            to="/h/$householdId/settings/categories/new"
            params={{ householdId }}
            search={{ kind }}
            state={OPEN_MODAL_STATE}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Plus aria-hidden />
            {t('add')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <SegmentedControl
          label={t('kind')}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setShowArchived(false);
          }}
          options={[
            { value: 'expense', label: t('expenses', { count: active('expense').length }) },
            { value: 'income', label: t('income', { count: active('income').length }) },
          ]}
          className="sm:w-80"
        />

        {active(kind).length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t(`empty_${kind}`)}</p>
        ) : (
          // Keyed by kind: switching tabs swaps the list instead of animating every row.
          <ul key={kind} className="divide-y">
            <AnimatePresence initial={false}>
              {active(kind).map((category) => (
                <m.li key={category.id} {...COLLAPSE} className="flex items-center gap-1">
                  <Link
                    to="/h/$householdId/settings/categories/$categoryId"
                    params={{ householdId, categoryId: category.id }}
                    state={OPEN_MODAL_STATE}
                    className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2 outline-none focus-visible:ring-[3px]"
                  >
                    <CategoryTile category={category} />
                    <span className="truncate">{category.name}</span>
                  </Link>
                  <CategoryActions householdId={householdId} category={category} />
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {archived.length > 0 && (
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showArchived}
              className="text-muted-foreground -ml-2.5"
              onClick={() => {
                setShowArchived((open) => !open);
              }}
            >
              <ChevronDown
                aria-hidden
                className={
                  showArchived ? 'rotate-180 transition-transform' : 'transition-transform'
                }
              />
              {t('archived', { count: archived.length })}
            </Button>
            <Collapse open={showArchived}>
              <ul className="mt-1">
                <AnimatePresence initial={false}>
                  {archived.map((category) => (
                    <ArchivedRow key={category.id} householdId={householdId} category={category} />
                  ))}
                </AnimatePresence>
              </ul>
            </Collapse>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryActions({ householdId, category }: { householdId: string; category: Category }) {
  const { t } = useTranslation('categories');
  const archive = useArchiveCategory();
  const [confirming, setConfirming] = useState(false);
  const name = category.name;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t('actionsFor', { name })} />}
        >
          <Ellipsis aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            render={
              <Link
                to="/h/$householdId/settings/categories/$categoryId"
                params={{ householdId, categoryId: category.id }}
                state={OPEN_MODAL_STATE}
              />
            }
          >
            <Pencil aria-hidden />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Archive aria-hidden />
            {t('archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) archive.reset();
        }}
        title={t('archiveTitle', { name })}
        description={t('archiveDescription')}
        confirmLabel={t('archive')}
        pendingLabel={t('archiving')}
        destructive
        pending={archive.isPending}
        error={archive.error ? errorMessage(archive.error) : undefined}
        onConfirm={() => {
          archive.mutate(
            { householdId, categoryId: category.id },
            {
              onSuccess: () => {
                setConfirming(false);
                toast.success(t('archivedToast', { name }));
              },
            },
          );
        }}
      />
    </>
  );
}

function ArchivedRow({ householdId, category }: { householdId: string; category: Category }) {
  const { t } = useTranslation('categories');
  const restore = useRestoreCategory();

  return (
    <m.li {...COLLAPSE} className="flex items-center gap-3 py-1.5">
      <CategoryTile category={category} className="opacity-60" />
      <span className="text-muted-foreground min-w-0 flex-1 truncate">{category.name}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={restore.isPending}
        aria-label={t('restoreLabel', { name: category.name })}
        onClick={() => {
          restore.mutate(
            { householdId, categoryId: category.id },
            {
              onSuccess: () => {
                toast.success(t('restored', { name: category.name }));
              },
            },
          );
        }}
      >
        <ArchiveRestore aria-hidden />
        {t('restore')}
      </Button>
    </m.li>
  );
}
