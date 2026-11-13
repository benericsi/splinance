import type { HouseholdDetail, SavingsEntry, SavingsGoal } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ellipsis, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Amount, MaskMoney } from '@/features/transactions/components/amount';
import { HeroAmountInput } from '@/features/transactions/components/amount-inputs';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatShortDate, today, toIsoDate } from '@/features/transactions/dates';
import { formatMoney } from '@/features/transactions/money';
import { COLLAPSE } from '@/lib/motion';
import { errorMessage } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { formatGoalDate, paceText, stepText } from '../describe';
import { entryFormSchema, newEntryValues, parseEntryInput } from '../form';
import { useAddEntry, useArchiveGoal, useRemoveEntry, useUpdateGoal } from '../hooks';
import { savingsQueries } from '../queries';
import { GoalBar } from './goal-bar';
import { GoalForm } from './goal-form';
import { GoalLegend } from './goal-box';

/**
 * A goal over the savings page: what it holds, the form to put money in or take it out,
 * and its history. Its maker and owners can edit or close it (as the API decides); a
 * closed goal shows only its history.
 */
export function GoalDialog({
  household,
  goal,
  fills,
  viewerId,
  onClose,
}: {
  household: HouseholdDetail;
  goal: SavingsGoal;
  fills: Map<string, string>;
  viewerId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(['savings', 'common']);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const update = useUpdateGoal();
  const archive = useArchiveGoal();
  const ref = { householdId: household.id, goalId: goal.id };
  const open = goal.archivedAt === null;
  // Mirrors the API rule: the goal's maker, or an owner.
  const mayManage = open && (household.role === 'owner' || goal.createdBy.userId === viewerId);
  const money = (minor: number) => formatMoney(minor, goal.currency);
  const step = stepText(goal);
  const pace = open ? paceText(goal, today()) : null;

  if (editing) {
    return (
      <RouteDialog title={t('form.editTitle')} onClose={onClose}>
        <GoalForm
          goal={goal}
          currency={goal.currency}
          error={update.error}
          submitLabel={t('common:save')}
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
          onSubmit={async ({ name, targetAmount, targetDate }) => {
            await update.mutateAsync({ ...ref, input: { name, targetAmount, targetDate } });
            toast.success(t('form.saved'));
            setEditing(false);
          }}
        />
      </RouteDialog>
    );
  }

  return (
    <RouteDialog
      title={goal.name}
      description={[
        t(goal.visibility === 'shared' ? 'goal.sharedGoal' : 'goal.privateGoal'),
        goal.targetDate && t('by', { date: formatGoalDate(goal.targetDate) }),
      ]
        .filter(Boolean)
        .join(' · ')}
      onClose={onClose}
    >
      <div className="min-w-0 space-y-5">
        <section className="space-y-2.5">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
              <MoneyFlow minor={goal.balance} currency={goal.currency} />
            </span>
            <span className="text-muted-foreground tabular-nums">
              {goal.targetAmount === null ? (
                t('noTarget')
              ) : (
                <MaskMoney>{t('of', { amount: money(goal.targetAmount) })}</MaskMoney>
              )}
            </span>
          </p>
          <GoalBar goal={goal} fills={fills} milestones />
          {goal.contributions.length > 0 && goal.visibility === 'shared' && (
            <GoalLegend goal={goal} fills={fills} viewerId={viewerId} />
          )}
          {(step ?? pace) && (
            <div className="text-sm">
              {step && (
                <p className="text-muted-foreground">
                  <MaskMoney>{step}</MaskMoney>
                </p>
              )}
              {pace && (
                <p className={pace.overdue ? 'text-warning' : undefined}>
                  <MaskMoney>{pace.text}</MaskMoney>
                </p>
              )}
            </div>
          )}
          {goal.archivedAt && (
            <p className="text-muted-foreground text-sm">
              {t('goal.closedOn', {
                date: formatGoalDate(toIsoDate(new Date(goal.archivedAt))),
              })}
            </p>
          )}
        </section>

        {open && <EntryForm householdId={household.id} goal={goal} />}

        <EntryHistory householdId={household.id} goal={goal} viewerId={viewerId} />

        {mayManage && (
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setClosing(true);
              }}
            >
              {t('goal.close')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              {t('common:edit')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={closing}
        onOpenChange={(next) => {
          setClosing(next);
          if (!next) archive.reset();
        }}
        title={t('goal.closeConfirm.title', { name: goal.name })}
        description={
          <>
            {t('goal.closeConfirm.description')}
            {goal.balance > 0 && (
              <>
                {' '}
                <MaskMoney>
                  {t('goal.closeConfirm.holds', { amount: money(goal.balance) })}
                </MaskMoney>
              </>
            )}
          </>
        }
        confirmLabel={t('goal.closeConfirm.confirm')}
        pendingLabel={t('goal.closeConfirm.pending')}
        destructive
        pending={archive.isPending}
        error={archive.error ? errorMessage(archive.error) : undefined}
        onConfirm={() => {
          archive.mutate(ref, {
            onSuccess: () => {
              toast.success(t('goal.closedToast'));
              setClosing(false);
              onClose();
            },
          });
        }}
      />
    </RouteDialog>
  );
}

/** Add or take out: one amount, a day and an optional note. Stays open for the next one. */
function EntryForm({ householdId, goal }: { householdId: string; goal: SavingsGoal }) {
  const { t } = useTranslation(['savings', 'common']);
  const add = useAddEntry();
  const form = useForm({
    defaultValues: newEntryValues(),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: entryFormSchema(goal.balance, goal.currency) },
    onSubmit: async ({ value, formApi }) => {
      try {
        await add.mutateAsync({
          householdId,
          goalId: goal.id,
          input: parseEntryInput(value, goal.balance, goal.currency),
        });
        toast.success(
          t(value.direction === 'in' ? 'entry.added' : 'entry.takenOut', { name: goal.name }),
        );
        formApi.reset({ ...newEntryValues(), direction: value.direction });
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  return (
    <form
      noValidate
      className="bg-muted/40 space-y-4 rounded-xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={add.error ? errorMessage(add.error) : undefined} />

      <form.Field name="direction">
        {(field) => (
          <SegmentedControl
            label={t('entry.direction')}
            value={field.state.value}
            onChange={(direction) => {
              field.handleChange(direction);
              add.reset();
            }}
            options={[
              { value: 'in', label: t('entry.add') },
              { value: 'out', label: t('entry.takeOut') },
            ]}
          />
        )}
      </form.Field>

      <form.Field name="amount">
        {(field) => {
          const error = firstError(field.state.meta.errors);
          return (
            <div className="space-y-1.5">
              <Label htmlFor="entry-amount" className="sr-only">
                {t('entry.amount')}
              </Label>
              <HeroAmountInput
                id="entry-amount"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                currency={goal.currency}
                error={error}
                autoFocus={false}
              />
              {error && (
                <p id="entry-amount-error" className="text-destructive text-center text-sm">
                  <MaskMoney>{error}</MaskMoney>
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="entryOn">
          {(field) => <TextField field={field} required label={t('entry.date')} type="date" />}
        </form.Field>
        <form.Field name="note">
          {(field) => (
            <TextField
              field={field}
              label={t('entry.note')}
              placeholder={t('entry.notePlaceholder')}
              maxLength={200}
            />
          )}
        </form.Field>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">{t('entry.outside')}</p>
        <form.Subscribe selector={(state) => [state.isSubmitting, state.values.direction] as const}>
          {([isSubmitting, direction]) => (
            <Button type="submit" size="lg" className="shrink-0" disabled={isSubmitting}>
              {isSubmitting
                ? t('common:saving')
                : t(direction === 'in' ? 'entry.submitAdd' : 'entry.submitTakeOut')}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

/** Newest first. The viewer removes their own entries (as the API decides), after a confirm. */
function EntryHistory({
  householdId,
  goal,
  viewerId,
}: {
  householdId: string;
  goal: SavingsGoal;
  viewerId: string;
}) {
  const { t } = useTranslation(['savings', 'common']);
  const list = useInfiniteQuery(savingsQueries.entries(householdId, goal.id));
  const remove = useRemoveEntry();
  const [removing, setRemoving] = useState<SavingsEntry | null>(null);
  const entries = list.data?.pages.flatMap((page) => page.entries) ?? [];
  const open = goal.archivedAt === null;

  return (
    <section>
      <h3 className="mb-1 text-sm font-medium">{t('goal.history')}</h3>
      {list.isPending ? (
        <p className="text-muted-foreground text-sm">{t('common:loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('goal.noHistory')}</p>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <m.li key={entry.id} {...COLLAPSE} className="not-last:border-b">
                <div className="flex min-h-11 items-center gap-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {entry.user.userId === viewerId ? t('you') : entry.user.displayName}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatShortDate(entry.entryOn)}
                    </p>
                  </div>
                  <Amount
                    minor={entry.amount}
                    currency={goal.currency}
                    signed
                    className={cn('font-medium tabular-nums', entry.amount > 0 && 'text-positive')}
                  />
                  {open && entry.user.userId === viewerId ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label={t('goal.entryActions')} />
                        }
                      >
                        <Ellipsis aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setRemoving(entry);
                          }}
                        >
                          <Trash2 aria-hidden />
                          {t('goal.remove')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="size-8 shrink-0" aria-hidden />
                  )}
                </div>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {list.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? t('common:loading') : t('common:loadMore')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRemoving(null);
            remove.reset();
          }
        }}
        title={t('goal.removeConfirm.title')}
        description={t('goal.removeConfirm.description')}
        confirmLabel={t('goal.removeConfirm.confirm')}
        pendingLabel={t('goal.removeConfirm.pending')}
        destructive
        pending={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : undefined}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { householdId, goalId: goal.id, entryId: removing.id },
            {
              onSuccess: () => {
                toast.success(t('goal.removed'));
                setRemoving(null);
              },
            },
          );
        }}
      />
    </section>
  );
}
