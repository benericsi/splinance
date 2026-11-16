import type { SavingsGoal } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaskMoney } from '@/features/transactions/components/amount';
import { currencySymbol, formatMoney } from '@/features/transactions/money';
import { useAmountInput } from '@/features/transactions/use-amount-input';
import { errorMessage } from '@/lib/query-client';
import { parsePlanInput, planFormSchema, planFormValues } from '../form';
import { useSetPlan } from '../hooks';
import { ownPlan } from '../view';

/**
 * "Your plan" in an open goal's dialog: what the viewer means to put in each month (set,
 * changed or removed here) and, on a shared goal, the others' plans. The plans decide
 * whether the goal is on track and what "Left this month" keeps back as "To set aside".
 */
export function PlanSection({
  householdId,
  goal,
  viewerId,
}: {
  householdId: string;
  goal: SavingsGoal;
  viewerId: string;
}) {
  const { t } = useTranslation('savings');
  const [editing, setEditing] = useState(false);
  const setPlan = useSetPlan();
  const mine = ownPlan(goal, viewerId);
  const others = goal.plans.filter((plan) => plan.userId !== viewerId);
  const money = (minor: number) => formatMoney(minor, goal.currency);

  return (
    <section aria-label={t('plan.title')} className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t('plan.title')}</h3>
          {!editing && (
            <p className="text-muted-foreground text-sm">
              {mine === null ? (
                t('plan.none')
              ) : (
                <MaskMoney>{t('plan.yours', { amount: money(mine) })}</MaskMoney>
              )}
            </p>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            {mine !== null && (
              <Button
                variant="ghost"
                size="sm"
                disabled={setPlan.isPending}
                onClick={() => {
                  setPlan.mutate(
                    { householdId, goalId: goal.id, monthlyAmount: null },
                    { onSuccess: () => toast.success(t('plan.removed')) },
                  );
                }}
              >
                {t('plan.remove')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlan.reset();
                setEditing(true);
              }}
            >
              {mine === null ? t('plan.set') : t('plan.change')}
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <PlanForm
          goal={goal}
          monthlyAmount={mine}
          onCancel={() => {
            setEditing(false);
          }}
          onSaved={() => {
            setEditing(false);
          }}
          householdId={householdId}
        />
      )}
      {!editing && setPlan.error && <FormError message={errorMessage(setPlan.error)} />}
      {others.length > 0 && (
        <ul className="text-muted-foreground text-sm">
          {others.map((plan) => (
            <li key={plan.userId}>
              <MaskMoney>
                {t('plan.theirs', { name: plan.displayName, amount: money(plan.monthlyAmount) })}
              </MaskMoney>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanForm({
  householdId,
  goal,
  monthlyAmount,
  onCancel,
  onSaved,
}: {
  householdId: string;
  goal: SavingsGoal;
  monthlyAmount: number | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['savings', 'common']);
  const setPlan = useSetPlan();
  const form = useForm({
    defaultValues: planFormValues(monthlyAmount, goal.currency),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: planFormSchema(goal.currency) },
    onSubmit: async ({ value }) => {
      try {
        const input = parsePlanInput(value, goal.currency);
        await setPlan.mutateAsync({ householdId, goalId: goal.id, ...input });
        toast.success(t('plan.saved'));
        onSaved();
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={setPlan.error ? errorMessage(setPlan.error) : undefined} />
      <form.Field name="amount">
        {(field) => {
          const error = firstError(field.state.meta.errors);
          return (
            <div className="space-y-1.5">
              <Label htmlFor="plan-amount">{t('plan.amount')}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <PlanAmountInput
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  currency={goal.currency}
                  invalid={error !== undefined}
                />
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? t('common:saving') : t('common:save')}
                    </Button>
                  )}
                </form.Subscribe>
                <Button type="button" variant="ghost" onClick={onCancel}>
                  {t('common:cancel')}
                </Button>
              </div>
              {error && (
                <p id="plan-amount-error" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>
    </form>
  );
}

/** A money field grouped while typing, with the currency after it. */
function PlanAmountInput({
  value,
  onChange,
  onBlur,
  currency,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  currency: SavingsGoal['currency'];
  invalid: boolean;
}) {
  const props = useAmountInput({ value, onChange, currency });
  return (
    <div className="relative w-40">
      <Input
        {...props}
        id="plan-amount"
        onBlur={onBlur}
        autoFocus
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'plan-amount-error' : undefined}
        className="pr-8 text-right tabular-nums"
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm">
        {currencySymbol(currency)}
      </span>
    </div>
  );
}
