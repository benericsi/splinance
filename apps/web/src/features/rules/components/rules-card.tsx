import type { Category, Rule } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { COLLAPSE } from '@/lib/motion';
import { errorMessage } from '@/lib/query-client';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { useDeleteRule, useReorderRules } from '../hooks';

/**
 * Household settings: the rules in the order they apply, with edit, move up and down, and
 * delete. The delete mutation and its dialog live here, not in the row: the row unmounts
 * once the rule is gone, and per-call callbacks of an unmounted component never run.
 */
export function RulesCard({
  householdId,
  rules,
  categories,
}: {
  householdId: string;
  rules: Rule[];
  categories: Category[];
}) {
  const { t } = useTranslation('rules');
  const reorder = useReorderRules();
  const remove = useDeleteRule();
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const move = (index: number, by: -1 | 1) => {
    const ids = rules.map((rule) => rule.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    reorder.mutate({ householdId, ruleIds: ids });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <Link
            to="/h/$householdId/settings/rules/new"
            params={{ householdId }}
            state={OPEN_MODAL_STATE}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Plus aria-hidden />
            {t('add')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ol className="divide-y">
            <AnimatePresence initial={false}>
              {rules.map((rule, index) => {
                const category = categoryById.get(rule.categoryId);
                return (
                  <m.li key={rule.id} {...COLLAPSE} className="flex items-center gap-1">
                    <Link
                      to="/h/$householdId/settings/rules/$ruleId"
                      params={{ householdId, ruleId: rule.id }}
                      state={OPEN_MODAL_STATE}
                      className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-1 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-2 outline-none focus-visible:ring-[3px]"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <Trans
                          t={t}
                          i18nKey="contains"
                          values={{ pattern: rule.pattern }}
                          components={{ strong: <span className="font-medium" /> }}
                        />
                      </span>
                      <span className="flex items-center gap-2">
                        <CategoryTile category={category} size="sm" />
                        <span
                          className={category?.archivedAt ? 'text-muted-foreground' : undefined}
                        >
                          {category?.name ?? t('unknown')}
                          {category?.archivedAt ? t('archived') : ''}
                        </span>
                        {rule.markShared && <Badge variant="secondary">{t('shared')}</Badge>}
                      </span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('actionsFor', { pattern: rule.pattern })}
                          />
                        }
                      >
                        <Ellipsis aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuItem
                          render={
                            <Link
                              to="/h/$householdId/settings/rules/$ruleId"
                              params={{ householdId, ruleId: rule.id }}
                              state={OPEN_MODAL_STATE}
                            />
                          }
                        >
                          <Pencil aria-hidden />
                          {t('edit')}
                        </DropdownMenuItem>
                        {index > 0 && (
                          <DropdownMenuItem
                            onClick={() => {
                              move(index, -1);
                            }}
                          >
                            <ArrowUp aria-hidden />
                            {t('moveUp')}
                          </DropdownMenuItem>
                        )}
                        {index < rules.length - 1 && (
                          <DropdownMenuItem
                            onClick={() => {
                              move(index, 1);
                            }}
                          >
                            <ArrowDown aria-hidden />
                            {t('moveDown')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleting(rule);
                          }}
                        >
                          <Trash2 aria-hidden />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </m.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            remove.reset();
          }
        }}
        title={t('deleteTitle', { pattern: deleting?.pattern ?? '' })}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        pendingLabel={t('deleting')}
        destructive
        pending={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : undefined}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(
            { householdId, ruleId: deleting.id },
            {
              onSuccess: () => {
                setDeleting(null);
                toast.success(t('deleted'));
              },
            },
          );
        }}
      />
    </Card>
  );
}
