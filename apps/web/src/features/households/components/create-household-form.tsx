import { createHouseholdInputSchema, type Household } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
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
  const create = useCreateHousehold();

  const form = useForm({
    defaultValues: { name: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createHouseholdInputSchema },
    onSubmit: async ({ value }) => {
      try {
        await onCreated(await create.mutateAsync(createHouseholdInputSchema.parse(value)));
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
            label="Name"
            placeholder="Home, Flatmates, Balaton trip"
            maxLength={60}
            autoFocus={autoFocus}
            onValueChange={create.reset}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create household'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
