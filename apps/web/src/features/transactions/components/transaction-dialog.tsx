import type { Category, HouseholdDetail, SplitMethod, Transaction } from '@splinance/shared';
import { useQueryClient } from '@tanstack/react-query';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { Lock, Repeat, Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePreferences } from '@/features/account/preferences';
import { CategoryPicker } from '@/features/categories/components/category-picker';
import { useAuth } from '@/lib/auth-store';
import { ApiError } from '@/lib/http';
import { COLLAPSE, TRANSITION_FAST } from '@/lib/motion';
import { errorMessage } from '@/lib/query-client';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import {
  editTransactionValues,
  newTransactionValues,
  parseTransactionInput,
  prefillShares,
  type TransactionFormValues,
  transactionFormSchema,
} from '../form';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useRestoreTransaction,
  useUpdateTransaction,
} from '../hooks';
import { parseAmount } from '../money';
import { transactionQueries } from '../queries';
import { HeroAmountInput } from './amount-inputs';
import { SplitEditor } from './split-editor';

interface TransactionDialogProps {
  household: HouseholdDetail;
  categories: Category[];
  /** Omitted when adding. */
  transaction?: Transaction | undefined;
  onClose: () => void;
}

/** Add or edit one transaction, with delete (and undo) when editing. */
export function TransactionDialog({
  household,
  categories,
  transaction,
  onClose,
}: TransactionDialogProps) {
  const { t } = useTranslation(['transactions', 'common']);
  const { user } = useAuth();
  const viewerId = user?.id ?? '';
  const { transactionVisibility } = usePreferences();
  const currency = household.baseCurrency;
  const queryClient = useQueryClient();
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const restore = useRestoreTransaction();
  // The version this form edits; replaced when the user loads someone else's newer save.
  const [base, setBase] = useState(transaction);

  const form = useForm({
    defaultValues: base
      ? editTransactionValues(base, household.members, viewerId)
      : newTransactionValues(household.members, viewerId, transactionVisibility),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: transactionFormSchema(currency) },
    onSubmit: async ({ value }) => {
      const input = parseTransactionInput(value, currency);
      try {
        if (base) {
          await update.mutateAsync({
            householdId: household.id,
            transactionId: base.id,
            input: { ...input, version: base.version },
          });
          toast.success(t('dialog.saved'));
        } else {
          await create.mutateAsync({ householdId: household.id, input });
          toast.success(t('dialog.added'));
        }
        onClose();
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  const mutationError = base ? update.error : create.error;
  const conflict = mutationError instanceof ApiError && mutationError.code === 'VERSION_CONFLICT';

  const loadLatest = async () => {
    if (!base) return;
    const latest = await queryClient.query({
      ...transactionQueries.detail(household.id, base.id),
      staleTime: 0,
    });
    setBase(latest);
    form.reset(editTransactionValues(latest, household.members, viewerId));
    update.reset();
  };

  const deleteTransaction = () => {
    if (!base) return;
    const ref = { householdId: household.id, transactionId: base.id };
    remove.mutate(ref, {
      onSuccess: () => {
        onClose();
        toast(t('dialog.deleted'), {
          // Longer than the 4 s default: an undo needs time to notice and reach.
          duration: 8000,
          action: {
            label: t('common:undo'),
            onClick: () => {
              restore.mutate(ref);
            },
          },
        });
      },
    });
  };

  return (
    <RouteDialog title={base ? t('dialog.editTitle') : t('dialog.addTitle')} onClose={onClose}>
      {/* min-w-0: a grid item, so long content must not widen the dialog's column. */}
      <form
        noValidate
        className="min-w-0 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {conflict ? (
          <div className="space-y-2">
            <FormError message={t('dialog.conflict')} />
            <Button type="button" variant="outline" size="sm" onClick={() => void loadLatest()}>
              {t('dialog.loadLatest')}
            </Button>
          </div>
        ) : (
          <FormError message={mutationError ? errorMessage(mutationError) : undefined} />
        )}

        <form.Field name="kind">
          {(field) => (
            <SegmentedControl
              label={t('dialog.type')}
              value={field.state.value}
              onChange={(kind) => {
                field.handleChange(kind);
                // Categories belong to one kind; keep the choice only if it still fits.
                const current = categories.find((c) => c.id === form.getFieldValue('categoryId'));
                if (current && current.kind !== kind) form.setFieldValue('categoryId', '');
              }}
              options={[
                { value: 'expense', label: t('dialog.expense') },
                { value: 'income', label: t('dialog.income') },
              ]}
            />
          )}
        </form.Field>

        <form.Field name="amount">
          {(field) => {
            const error = firstError(field.state.meta.errors);
            return (
              <div className="space-y-1.5">
                <Label htmlFor="field-amount" className="sr-only">
                  {t('amount.label')}
                </Label>
                <HeroAmountInput
                  id="field-amount"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  currency={currency}
                  error={error}
                  autoFocus={!base}
                />
                {error && (
                  <p id="field-amount-error" className="text-destructive text-center text-sm">
                    {error}
                  </p>
                )}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <TextField
              field={field}
              required
              label={t('dialog.description')}
              placeholder={t('dialog.descriptionPlaceholder')}
              maxLength={120}
            />
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="occurredOn">
            {(field) => <TextField field={field} required label={t('dialog.date')} type="date" />}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.kind}>
            {(kind) => (
              <form.Field name="categoryId">
                {(field) => {
                  const options = categories.filter(
                    (c) => c.kind === kind && (c.archivedAt === null || c.id === field.state.value),
                  );
                  return (
                    <div className="space-y-1.5">
                      <Label htmlFor="field-categoryId">{t('dialog.category')}</Label>
                      <CategoryPicker
                        id="field-categoryId"
                        categories={options}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                      />
                    </div>
                  );
                }}
              </form.Field>
            )}
          </form.Subscribe>
        </div>

        <form.Field name="visibility">
          {(field) => (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('dialog.whoFor')}</p>
              <SegmentedControl
                label={t('dialog.whoFor')}
                value={field.state.value}
                onChange={field.handleChange}
                options={[
                  { value: 'shared', label: t('dialog.shared') },
                  {
                    value: 'private',
                    label: (
                      <>
                        <Lock aria-hidden /> {t('dialog.justMe')}
                      </>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </form.Field>

        {/* The split lives in the `shares` field, so validation errors for it land there. */}
        <form.Field name="shares">
          {(sharesField) => (
            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                // Shared <-> Just me swaps the split editor and the note by height.
                <AnimatePresence initial={false} mode="wait">
                  <m.div key={values.visibility} {...COLLAPSE} transition={TRANSITION_FAST}>
                    {values.visibility === 'private' ? (
                      <p className="text-muted-foreground text-sm">{t('dialog.privateNote')}</p>
                    ) : (
                      <SplitEditor
                        currency={currency}
                        kind={values.kind}
                        amount={parseAmount(values.amount, currency)}
                        viewerId={viewerId}
                        paidBy={values.paidBy}
                        splitMethod={values.splitMethod}
                        shares={values.shares}
                        error={firstError(sharesField.state.meta.errors)}
                        onPaidByChange={(userId) => {
                          form.setFieldValue('paidBy', userId);
                        }}
                        onMethodChange={(method: SplitMethod) => {
                          sharesField.handleChange(prefillShares(values, method, currency));
                          form.setFieldValue('splitMethod', method);
                        }}
                        onSharesChange={(shares: TransactionFormValues['shares']) => {
                          sharesField.handleChange(shares);
                        }}
                      />
                    )}
                  </m.div>
                </AnimatePresence>
              )}
            </form.Subscribe>
          )}
        </form.Field>

        {base && (
          <Link
            to="/h/$householdId/recurring/new"
            params={{ householdId: household.id }}
            search={{ from: base.id }}
            state={OPEN_MODAL_STATE}
            className="text-link inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <Repeat className="size-3.5" aria-hidden />
            {t('dialog.makeRecurring')}
          </Link>
        )}

        <div
          className={cn('flex items-center gap-2 pt-2', base ? 'justify-between' : 'justify-end')}
        >
          {base && (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={remove.isPending}
              onClick={deleteTransaction}
            >
              <Trash2 aria-hidden />
              {t('dialog.delete')}
            </Button>
          )}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                size="lg"
                className="min-w-28"
                disabled={isSubmitting || conflict}
              >
                {isSubmitting ? t('common:saving') : t('common:save')}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </RouteDialog>
  );
}
