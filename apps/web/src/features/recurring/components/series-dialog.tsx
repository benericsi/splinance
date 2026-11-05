import {
  type Category,
  type Currency,
  type RecurringCadence,
  type RecurringScope,
  type RecurringSeries,
  suggestRecurringPattern,
} from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Lock } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryPicker } from '@/features/categories/components/category-picker';
import { currencySymbol, formatMoney } from '@/features/transactions/money';
import { useAmountInput } from '@/features/transactions/use-amount-input';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import {
  editSeriesValues,
  newSeriesValues,
  parseSeriesInput,
  type SeriesFormValues,
  seriesFormSchema,
} from '../form';
import { useAddSeries, useRemoveSeries, useUpdateSeries } from '../hooks';
import { shortDate } from '../view';
import { MatchPreview } from './match-preview';

const CADENCES: RecurringCadence[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Add a recurring payment by hand (or from a transaction), or look at one and edit it. The
 * text to match fills in from the name until the person edits it, and a preview under it
 * shows which past payments it would own.
 */
export function SeriesDialog({
  householdId,
  currency,
  categories,
  series,
  initialValues,
  onClose,
}: {
  householdId: string;
  currency: Currency;
  /** Expense categories that may be picked (active, or the series' own). */
  categories: Category[];
  /** Omitted when adding. */
  series?: RecurringSeries | undefined;
  /** Prefilled values when adding ("Make recurring"). */
  initialValues?: SeriesFormValues | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation(['recurring', 'common']);
  const add = useAddSeries();
  const update = useUpdateSeries();
  const remove = useRemoveSeries();
  const mutation = series ? update : add;
  const [stopping, setStopping] = useState(false);
  // Follows the name until the person types a pattern of their own (or one was prefilled).
  const [patternEdited, setPatternEdited] = useState(series !== undefined || !!initialValues);

  const form = useForm({
    defaultValues: series
      ? editSeriesValues(series, currency)
      : (initialValues ?? newSeriesValues()),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: seriesFormSchema(currency) },
    onSubmit: async ({ value }) => {
      const input = parseSeriesInput(value, currency, series?.startsOn ?? null);
      try {
        if (series) {
          // The scope rides along and the API ignores it: who a series belongs to stays.
          await update.mutateAsync({ householdId, seriesId: series.id, input });
          toast.success(t('dialog.saved'));
        } else {
          await add.mutateAsync({ householdId, input });
          toast.success(t('dialog.added'));
        }
        onClose();
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  const taken =
    mutation.error instanceof ApiError && mutation.error.code === 'SERIES_PATTERN_TAKEN';
  const formError = mutation.error && !taken ? errorMessage(mutation.error) : undefined;

  const stop = () => {
    if (!series) return;
    remove.mutate(
      { householdId, seriesId: series.id },
      {
        onSuccess: () => {
          setStopping(false);
          toast.success(t('dialog.stopped', { name: series.name }));
          onClose();
        },
      },
    );
  };

  return (
    <RouteDialog title={series ? series.name : t('dialog.addTitle')} onClose={onClose}>
      <form
        noValidate
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError message={formError} />

        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              required
              label={t('dialog.name')}
              placeholder={t('dialog.namePlaceholder')}
              maxLength={60}
              autoFocus={!series && !initialValues}
              onValueChange={(name) => {
                if (!patternEdited) form.setFieldValue('pattern', suggestRecurringPattern(name));
              }}
            />
          )}
        </form.Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="amount">
            {(field) => (
              <AmountField
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                currency={currency}
                error={firstError(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="anchorOn">
            {(field) => <TextField field={field} required type="date" label={t('dialog.anchor')} />}
          </form.Field>
        </div>

        <form.Field name="cadence">
          {(field) => (
            <div className="space-y-1.5">
              <Label>{t('dialog.howOften')}</Label>
              <SegmentedControl<RecurringCadence>
                label={t('dialog.howOften')}
                value={field.state.value}
                onChange={field.handleChange}
                options={CADENCES.map((value) => ({
                  value,
                  label: t(`cadenceOption.${value}`),
                }))}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="categoryId">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="series-category">{t('dialog.category')}</Label>
              <CategoryPicker
                id="series-category"
                categories={categories}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>

        {series ? (
          series.scope === 'private' && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Lock className="size-3.5" aria-hidden />
              {t('dialog.onlyYouSee')}
            </p>
          )
        ) : (
          <form.Field name="scope">
            {(field) => (
              <div className="space-y-1.5">
                <Label>{t('dialog.whoSees')}</Label>
                <SegmentedControl<RecurringScope>
                  label={t('dialog.whoSees')}
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={[
                    { value: 'shared', label: t('dialog.household') },
                    { value: 'private', label: t('dialog.onlyMe') },
                  ]}
                />
              </div>
            )}
          </form.Field>
        )}

        <form.Subscribe
          selector={(state) =>
            [state.values.amount, state.values.amountVaries, state.values.scope] as const
          }
        >
          {([amount, amountVaries, scope]) => (
            <form.Field name="pattern">
              {(field) => (
                <TextField
                  field={field}
                  required
                  label={t('dialog.pattern')}
                  placeholder={t('dialog.patternPlaceholder')}
                  maxLength={60}
                  serverError={taken ? t('dialog.taken') : undefined}
                  onValueChange={() => {
                    setPatternEdited(true);
                    mutation.reset();
                  }}
                  description={
                    <MatchPreview
                      id="series-preview"
                      householdId={householdId}
                      currency={currency}
                      pattern={field.state.value}
                      amount={amount}
                      amountVaries={amountVaries}
                      scope={scope}
                      startsOn={series?.startsOn ?? null}
                    />
                  }
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>

        <div className="space-y-2.5">
          <form.Field name="amountVaries">
            {(field) => (
              <Checkbox
                label={t('dialog.varies')}
                checked={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="remind">
            {(field) => (
              <Checkbox
                label={t('dialog.remind')}
                checked={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>

        {series && series.payments.length > 0 && (
          <section aria-labelledby="series-payments" className="space-y-2">
            <h3 id="series-payments" className="text-sm font-medium">
              {t('dialog.payments', { count: series.paymentCount })}
            </h3>
            <ul className="divide-y rounded-lg border text-sm">
              {series.payments.slice(0, 6).map((payment) => (
                <li key={payment.transactionId} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 tabular-nums">
                    {shortDate(payment.occurredOn)}
                  </span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {payment.imported ? t('dialog.imported') : t('dialog.typedIn')}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(payment.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {series ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                setStopping(true);
              }}
            >
              {t('dialog.stop')}
            </Button>
          ) : (
            <span />
          )}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="lg" className="min-w-28" disabled={isSubmitting}>
                {isSubmitting ? t('common:saving') : series ? t('common:save') : t('dialog.add')}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>

      {series && (
        <ConfirmDialog
          open={stopping}
          onOpenChange={setStopping}
          title={t('dialog.stopTitle', { name: series.name })}
          description={t('dialog.stopDescription')}
          confirmLabel={t('dialog.stop')}
          pendingLabel={t('dialog.stopping')}
          destructive
          pending={remove.isPending}
          error={remove.error ? errorMessage(remove.error) : undefined}
          onConfirm={stop}
        />
      )}
    </RouteDialog>
  );
}

function AmountField({
  value,
  onChange,
  onBlur,
  currency,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  currency: Currency;
  error: string | undefined;
}) {
  const { t } = useTranslation('recurring');
  const props = useAmountInput({ value, onChange, currency });
  return (
    <div className="space-y-1.5">
      <Label htmlFor="series-amount">
        {t('dialog.amount')}
        <span aria-hidden className="text-destructive -ml-1">
          *
        </span>
      </Label>
      <div className="relative">
        <Input
          {...props}
          id="series-amount"
          onBlur={onBlur}
          aria-required
          aria-invalid={error !== undefined}
          aria-describedby={error ? 'series-amount-error' : undefined}
          className="h-10 pr-9 tabular-nums"
        />
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
          {currencySymbol(currency)}
        </span>
      </div>
      {error && (
        <p id="series-amount-error" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="accent-primary mt-0.5 size-4 shrink-0"
      />
      {label}
    </label>
  );
}
