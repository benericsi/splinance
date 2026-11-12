import type { Currency, SavingsGoal, SavingsGoalInput } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { HeroAmountInput } from '@/features/transactions/components/amount-inputs';
import { errorMessage } from '@/lib/query-client';
import { goalFormSchema, goalFormValues, parseGoalInput } from '../form';

/**
 * A goal's name, target and date. A new goal also chooses who sees it, once: an existing
 * goal's visibility is not offered, the API never changes it.
 */
export function GoalForm({
  goal,
  currency,
  defaultVisibility = 'shared',
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** The goal to edit; none for a new one. */
  goal?: SavingsGoal;
  currency: Currency;
  defaultVisibility?: SavingsGoalInput['visibility'];
  /** The mutation's error, shown above the fields. */
  error: unknown;
  submitLabel: string;
  onSubmit: (input: SavingsGoalInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation(['savings', 'common']);
  const form = useForm({
    defaultValues: goalFormValues(goal, currency, defaultVisibility),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: goalFormSchema(currency) },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(parseGoalInput(value, currency));
      } catch {
        // Rendered from the mutation error above.
      }
    },
  });

  return (
    <form
      noValidate
      className="min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={error ? errorMessage(error) : undefined} />

      <form.Field name="name">
        {(field) => (
          <TextField
            field={field}
            required
            label={t('form.name')}
            placeholder={t('form.namePlaceholder')}
            maxLength={60}
          />
        )}
      </form.Field>

      <form.Field name="target">
        {(field) => {
          const fieldError = firstError(field.state.meta.errors);
          return (
            <div className="space-y-1.5">
              <Label htmlFor="goal-target" className="justify-center">
                {t('form.target')}
              </Label>
              <HeroAmountInput
                id="goal-target"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                currency={currency}
                error={fieldError}
                autoFocus={false}
              />
              {fieldError ? (
                <p id="goal-target-error" className="text-destructive text-center text-sm">
                  {fieldError}
                </p>
              ) : (
                <p className="text-muted-foreground text-center text-sm">{t('form.targetHint')}</p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field name="targetDate">
        {(field) => <TextField field={field} label={t('form.date')} type="date" />}
      </form.Field>

      {!goal && (
        <form.Field name="visibility">
          {(field) => (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('form.visibility')}</p>
              <SegmentedControl
                label={t('form.visibility')}
                value={field.state.value}
                onChange={field.handleChange}
                options={[
                  { value: 'shared', label: t('form.everyone') },
                  { value: 'private', label: t('form.justMe') },
                ]}
              />
              <p className="text-muted-foreground text-sm">{t('form.visibilityHint')}</p>
            </div>
          )}
        </form.Field>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="lg" className="min-w-28" disabled={isSubmitting}>
              {isSubmitting ? t('common:saving') : submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
