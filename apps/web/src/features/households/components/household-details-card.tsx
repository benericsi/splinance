import { type HouseholdDetail, updateHouseholdInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { HouseholdAvatar } from '@/components/household-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/features/account/format';
import { errorMessage } from '@/lib/query-client';
import { useUpdateHousehold } from '../hooks';

/** Name, currency and age of the household; owners rename it inline. */
export function HouseholdDetailsCard({ household }: { household: HouseholdDetail }) {
  const { t } = useTranslation('households');
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
                {t('details.created', {
                  currency: household.baseCurrency,
                  date: formatDate(household.createdAt),
                })}
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
                {t('details.rename')}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RenameForm({ household, onDone }: { household: HouseholdDetail; onDone: () => void }) {
  const { t } = useTranslation(['households', 'common']);
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
          toast.success(t('details.renamed'));
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
      aria-label={t('details.renameForm')}
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
            label={t('name')}
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
              {isSubmitting ? t('common:saving') : t('common:save')}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common:cancel')}
        </Button>
      </div>
    </form>
  );
}
