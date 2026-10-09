import { type HouseholdDetail, updateHouseholdInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { HouseholdAvatar } from '@/components/household-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { errorMessage } from '@/lib/query-client';
import { useUpdateHousehold } from '../hooks';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

/** Name, currency and age of the household; owners rename it inline. */
export function HouseholdDetailsCard({ household }: { household: HouseholdDetail }) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <HouseholdAvatar household={household} size={48} decorative />
        {editing ? (
          <RenameForm
            household={household}
            onDone={() => {
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="font-heading truncate text-lg font-semibold">{household.name}</p>
              <p className="text-muted-foreground text-sm">
                {household.baseCurrency} · created{' '}
                {dateFormat.format(new Date(household.createdAt))}
              </p>
            </div>
            {household.role === 'owner' && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden />
                Rename
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RenameForm({ household, onDone }: { household: HouseholdDetail; onDone: () => void }) {
  const update = useUpdateHousehold();

  const form = useForm({
    defaultValues: { name: household.name },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: updateHouseholdInputSchema },
    onSubmit: async ({ value }) => {
      try {
        const input = updateHouseholdInputSchema.parse(value);
        if (input.name !== household.name) {
          await update.mutateAsync({ householdId: household.id, input });
          toast.success('Household renamed');
        }
        onDone();
      } catch {
        // Rendered from update.error below.
      }
    },
  });

  return (
    <form
      noValidate
      aria-label="Rename household"
      className="min-w-0 flex-1 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone();
      }}
    >
      <FormError message={update.error ? errorMessage(update.error) : undefined} />
      <form.Field name="name">
        {(field) => (
          <TextField
            field={field}
            required
            label="Name"
            maxLength={60}
            // Opened by an explicit click on Rename, so moving focus here is expected.
            autoFocus
            onValueChange={update.reset}
          />
        )}
      </form.Field>
      <div className="flex gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
