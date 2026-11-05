import { createHouseholdInputSchema, type Household } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale';
import { errorMessage } from '@/lib/query-client';
import { useCreateHousehold } from '../hooks';

/** Name field and submit; used by the new household modal and onboarding. */
export function CreateHouseholdForm({
  onCreated,
  autoFocus = false,
}: {
  onCreated: (household: Household) => Promise<void> | void;
  /** Only where creating a household is the single purpose of the page. */
  autoFocus?: boolean;
}) {
  const { t } = useTranslation('households');
  const locale = useLocale();
  const create = useCreateHousehold();

  const form = useForm({
    defaultValues: { name: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createHouseholdInputSchema },
    onSubmit: async ({ value }) => {
      try {
        // The default categories are named in the language the household is created in.
        const input = createHouseholdInputSchema.parse({ ...value, locale });
        await onCreated(await create.mutateAsync(input));
      } catch {
        // Rendered from create.error below.
      }
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={create.error ? errorMessage(create.error) : undefined} />

      <form.Field name="name">
        {(field) => (
          <TextField
            field={field}
            required
            label={t('name')}
            placeholder={t('namePlaceholder')}
            maxLength={60}
            autoFocus={autoFocus}
            onValueChange={create.reset}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting ? t('creating') : t('create')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
