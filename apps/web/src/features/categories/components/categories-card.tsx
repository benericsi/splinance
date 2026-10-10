import type { Category, CategoryKind } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const active = (k: CategoryKind) => categories.filter((c) => c.kind === k && !c.archivedAt);
  const archived = categories.filter((c) => c.kind === kind && c.archivedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardAction>
          <Link
            to="/h/$householdId/settings/categories/new"
            params={{ householdId }}
            search={{ kind }}
            state={OPEN_MODAL_STATE}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Plus aria-hidden />
            Add category
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <SegmentedControl
          label="Kind"
          value={kind}
          onChange={(next) => {
            setKind(next);
            setShowArchived(false);
          }}
          options={[
            { value: 'expense', label: `Expenses (${String(active('expense').length)})` },
            { value: 'income', label: `Income (${String(active('income').length)})` },
          ]}
          className="sm:w-80"
        />

        {active(kind).length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">
            No {kind === 'expense' ? 'expense' : 'income'} categories. Transactions can still go
            without one.
          </p>
        ) : (
          <ul className="divide-y">
            {active(kind).map((category) => (
              <li key={category.id} className="flex items-center gap-1">
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
              </li>
            ))}
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
              Archived ({archived.length})
            </Button>
            {showArchived && (
              <ul className="mt-1">
                {archived.map((category) => (
                  <ArchivedRow key={category.id} householdId={householdId} category={category} />
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryActions({ householdId, category }: { householdId: string; category: Category }) {
  const archive = useArchiveCategory();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={`Actions for ${category.name}`} />
          }
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
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Archive aria-hidden />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) archive.reset();
        }}
        title={`Archive ${category.name}?`}
        description="It disappears from the category picker. Transactions filed under it keep showing it, and you can restore it later."
        confirmLabel="Archive"
        pendingLabel="Archiving…"
        destructive
        pending={archive.isPending}
        error={archive.error ? errorMessage(archive.error) : undefined}
        onConfirm={() => {
          archive.mutate(
            { householdId, categoryId: category.id },
            {
              onSuccess: () => {
                setConfirming(false);
                toast.success(`${category.name} archived`);
              },
            },
          );
        }}
      />
    </>
  );
}

function ArchivedRow({ householdId, category }: { householdId: string; category: Category }) {
  const restore = useRestoreCategory();

  return (
    <li className="flex items-center gap-3 py-1.5">
      <CategoryTile category={category} className="opacity-60" />
      <span className="text-muted-foreground min-w-0 flex-1 truncate">{category.name}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={restore.isPending}
        aria-label={`Restore ${category.name}`}
        onClick={() => {
          restore.mutate(
            { householdId, categoryId: category.id },
            {
              onSuccess: () => {
                toast.success(`${category.name} restored`);
              },
            },
          );
        }}
      >
        <ArchiveRestore aria-hidden />
        Restore
      </Button>
    </li>
  );
}
