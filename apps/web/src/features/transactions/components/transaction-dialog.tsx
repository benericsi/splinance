import type { Category, HouseholdDetail, SplitMethod, Transaction } from '@splinance/shared';
import { useQueryClient } from '@tanstack/react-query';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { useAuth } from '@/lib/auth-store';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
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
import {
  AMOUNT_INPUT_MAX_LENGTH,
  currencySymbol,
  parseAmount,
  sanitizeAmountInput,
} from '../money';
import { transactionQueries } from '../queries';
import { SplitEditor } from './split-editor';

/** Validators may report strings or Standard Schema issues ({ message }). */
function firstError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'message' in error)
      return String(error.message);
  }
  return undefined;
}

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
  const { user } = useAuth();
  const viewerId = user?.id ?? '';
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
      ? editTransactionValues(base, household.members)
      : newTransactionValues(household.members, viewerId),
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
          toast.success('Transaction saved');
        } else {
          await create.mutateAsync({ householdId: household.id, input });
          toast.success('Transaction added');
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
    form.reset(editTransactionValues(latest, household.members));
    update.reset();
  };

  const deleteTransaction = () => {
    if (!base) return;
    const ref = { householdId: household.id, transactionId: base.id };
    remove.mutate(ref, {
      onSuccess: () => {
        onClose();
        toast('Transaction deleted', {
          // Longer than the 4 s default: an undo needs time to notice and reach.
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

  return (
    <RouteDialog title={base ? 'Edit transaction' : 'Add transaction'} onClose={onClose}>
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
            <FormError message="Someone else saved a change to this transaction. Load it to see their version, then edit again." />
            <Button type="button" variant="outline" size="sm" onClick={() => void loadLatest()}>
              Load latest version
            </Button>
          </div>
        ) : (
          <FormError message={mutationError ? errorMessage(mutationError) : undefined} />
        )}

        <form.Field name="kind">
          {(field) => (
            <SegmentedControl
              label="Type"
              value={field.state.value}
              onChange={(kind) => {
                field.handleChange(kind);
                // Categories belong to one kind; keep the choice only if it still fits.
                const current = categories.find((c) => c.id === form.getFieldValue('categoryId'));
                if (current && current.kind !== kind) form.setFieldValue('categoryId', '');
              }}
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
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
                  Amount
                </Label>
                <div className="flex min-w-0 items-baseline justify-center gap-2">
                  <input
                    id="field-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    autoFocus={!base}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    maxLength={AMOUNT_INPUT_MAX_LENGTH}
                    onChange={(e) => {
                      field.handleChange(sanitizeAmountInput(e.target.value));
                    }}
                    aria-invalid={error !== undefined}
                    aria-describedby={error ? 'field-amount-error' : undefined}
                    className={cn(
                      'font-heading placeholder:text-muted-foreground/60 focus-visible:border-ring aria-invalid:border-destructive max-w-full min-w-[2ch] border-b-2 border-transparent bg-transparent text-center font-semibold tabular-nums outline-none',
                      // Long numbers get smaller instead of overflowing the row.
                      field.state.value.length > 12
                        ? 'text-2xl'
                        : field.state.value.length > 8
                          ? 'text-3xl'
                          : 'text-4xl',
                    )}
                    style={{ fieldSizing: 'content' }}
                  />
                  <span className="text-muted-foreground text-xl">{currencySymbol(currency)}</span>
                </div>
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
              label="Description"
              placeholder="Groceries at Spar"
              maxLength={120}
            />
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="occurredOn">
            {(field) => <TextField field={field} required label="Date" type="date" />}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.kind}>
            {(kind) => (
              <form.Field name="categoryId">
                {(field) => {
                  const options = categories.filter(
                    (c) => c.kind === kind && (c.archivedAt === null || c.id === field.state.value),
                  );
                  const selected = categories.find((c) => c.id === field.state.value);
                  return (
                    <div className="space-y-1.5">
                      <Label htmlFor="field-categoryId">Category</Label>
                      <div className="relative">
                        <CategoryTile
                          category={selected}
                          size="sm"
                          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
                        />
                        <select
                          id="field-categoryId"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                          }}
                          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-10 w-full rounded-lg border bg-transparent pr-2 pl-10 text-sm outline-none focus-visible:ring-3"
                        >
                          <option value="">No category</option>
                          {options.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
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
              <p className="text-sm font-medium">Who is it for?</p>
              <SegmentedControl
                label="Who is it for?"
                value={field.state.value}
                onChange={field.handleChange}
                options={[
                  { value: 'shared', label: 'Shared' },
                  {
                    value: 'private',
                    label: (
                      <>
                        <Lock aria-hidden /> Just me
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
              {(values) =>
                values.visibility === 'private' ? (
                  <p className="text-muted-foreground text-sm">
                    Only you can see it. It counts toward your own spending, not the shared balance.
                  </p>
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
                )
              }
            </form.Subscribe>
          )}
        </form.Field>

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
              Delete
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
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </RouteDialog>
  );
}
