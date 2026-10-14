import type { Budget, Category, Currency } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CategoryPicker } from '@/features/categories/components/category-picker';
import { HeroAmountInput } from '@/features/transactions/components/amount-inputs';
import { formatMonth } from '@/features/transactions/dates';
import { amountProblemMessage, formatAmountInput, readAmount } from '@/features/transactions/money';
import { errorMessage } from '@/lib/query-client';
import { useSetBudget } from '../hooks';

interface BudgetFormValues {
  categoryId: string;
  /** As typed. */
  amount: string;
}

function budgetFormSchema(currency: Currency) {
  return z.custom<BudgetFormValues>().superRefine((values, ctx) => {
    if (!values.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category' });
    }
    const amount = readAmount(values.amount, currency);
    if (amount.problem) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: amountProblemMessage(amount.problem, currency),
      });
    }
  });
}

/**
 * Sets a category's monthly budget from the month on screen, or removes it from then on.
 * Picking a category that has a budget that month prefills its amount.
 */
export function BudgetDialog({
  householdId,
  currency,
  month,
  categories,
  budgets,
  initialCategoryId,
  onClose,
}: {
  householdId: string;
  currency: Currency;
  month: string;
  /** Active expense categories. */
  categories: Category[];
  /** The budgets in force that month. */
  budgets: Budget[];
  initialCategoryId: string | undefined;
  onClose: () => void;
}) {
  const save = useSetBudget();
  const remove = useSetBudget();
  const budgetOf = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId);
  const initial = initialCategoryId ? budgetOf(initialCategoryId) : undefined;

  const form = useForm({
    defaultValues: {
      categoryId: initialCategoryId ?? '',
      amount: initial ? formatAmountInput(initial.amount, currency) : '',
    } satisfies BudgetFormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: budgetFormSchema(currency) },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({
          householdId,
          categoryId: value.categoryId,
          input: { amount: readAmount(value.amount, currency).minor ?? null, from: month },
        });
        toast.success('Budget saved');
        onClose();
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  const mutationError = save.error ?? remove.error;

  return (
    <RouteDialog title={initial ? 'Change budget' : 'Set budget'} onClose={onClose}>
      <form
        noValidate
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError message={mutationError ? errorMessage(mutationError) : undefined} />

        <form.Field name="categoryId">
          {(field) => {
            const error = firstError(field.state.meta.errors);
            return (
              <div className="space-y-1.5">
                <Label htmlFor="budget-category">Category</Label>
                <CategoryPicker
                  id="budget-category"
                  categories={categories}
                  value={field.state.value}
                  onChange={(categoryId) => {
                    field.handleChange(categoryId);
                    // Start from its current amount, if it has one.
                    const existing = budgetOf(categoryId);
                    if (existing) {
                      form.setFieldValue('amount', formatAmountInput(existing.amount, currency));
                    }
                  }}
                  onBlur={field.handleBlur}
                />
                {error && <p className="text-destructive text-sm">{error}</p>}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="amount">
          {(field) => {
            const error = firstError(field.state.meta.errors);
            return (
              <div className="space-y-1.5">
                <Label htmlFor="budget-amount" className="justify-center">
                  Every month
                </Label>
                <HeroAmountInput
                  id="budget-amount"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  currency={currency}
                  error={error}
                  autoFocus={initialCategoryId !== undefined}
                />
                {error && (
                  <p id="budget-amount-error" className="text-destructive text-center text-sm">
                    {error}
                  </p>
                )}
              </div>
            );
          }}
        </form.Field>

        <p className="text-muted-foreground text-center text-sm">
          From {formatMonth(month)} on. Earlier months keep theirs.
        </p>

        <form.Subscribe
          selector={(state) => [state.isSubmitting, state.values.categoryId] as const}
        >
          {([isSubmitting, categoryId]) => (
            <div className="flex items-center justify-between gap-2 pt-1">
              {budgetOf(categoryId) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(
                      { householdId, categoryId, input: { amount: null, from: month } },
                      {
                        onSuccess: () => {
                          toast.success('Budget removed');
                          onClose();
                        },
                      },
                    );
                  }}
                >
                  Remove budget
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" size="lg" className="min-w-28" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </RouteDialog>
  );
}
