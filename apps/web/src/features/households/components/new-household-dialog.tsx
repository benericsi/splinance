import { createHouseholdInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/query-client';
import { useCloseModal } from '@/lib/route-modal';
import { useCreateHousehold } from '../hooks';

/** Opened from anywhere with `?modal=new-household` (see the _authenticated layout). */
export function NewHouseholdDialog() {
  const navigate = useNavigate();
  const create = useCreateHousehold();
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '.', search: (prev) => ({ ...prev, modal: undefined }), replace: true });
    }, [navigate]),
  );

  const form = useForm({
    defaultValues: { name: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createHouseholdInputSchema },
    onSubmit: async ({ value }) => {
      try {
        const household = await create.mutateAsync(createHouseholdInputSchema.parse(value));
        // Replace the modal entry, so back from the new household returns to where it started.
        await navigate({
          to: '/h/$householdId',
          params: { householdId: household.id },
          replace: true,
        });
      } catch {
        // Rendered from create.error below.
      }
    },
  });

  return (
    <RouteDialog
      title="New household"
      description="A shared space for expenses. You can invite people once it exists."
      onClose={close}
    >
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
              onValueChange={create.reset}
            />
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create household'}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </RouteDialog>
  );
}
