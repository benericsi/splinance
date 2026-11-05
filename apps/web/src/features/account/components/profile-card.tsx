import { useTranslation } from 'react-i18next';
import { displayNameSchema, type User } from '@splinance/shared';
import { z } from 'zod';

// The rename form: only the name (the API also takes the language on its own).
const renameSchema = z.object({ displayName: displayNameSchema });
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { errorMessage } from '@/lib/query-client';
import { useUpdateProfile } from '../hooks';

/** Name (editable inline, like renaming a household) and the email, read-only. */
export function ProfileCard({ user }: { user: User }) {
  const { t } = useTranslation(['account', 'common', 'auth']);
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <UserAvatar user={user} size={48} />
          {editing ? (
            <RenameForm
              user={user}
              onDone={() => {
                setEditing(false);
              }}
            />
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="font-heading truncate text-lg font-semibold">{user.displayName}</p>
                <p className="text-muted-foreground truncate text-sm">{user.email}</p>
              </div>
              {!__DEMO_SITE__ && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  <Pencil aria-hidden />
                  {t('profile.editName')}
                </Button>
              )}
            </>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{t('profile.emailNote')}</p>
      </CardContent>
    </Card>
  );
}

function RenameForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { t } = useTranslation(['account', 'common', 'auth']);
  const update = useUpdateProfile();

  const form = useForm({
    defaultValues: { displayName: user.displayName },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: renameSchema },
    onSubmit: async ({ value }) => {
      try {
        const input = renameSchema.parse(value);
        if (input.displayName !== user.displayName) {
          await update.mutateAsync(input);
          toast.success(t('profile.nameChanged'));
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
      aria-label={t('profile.editName')}
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
      <form.Field name="displayName">
        {(field) => (
          <TextField
            field={field}
            required
            label={t('profile.displayName')}
            placeholder={t('profile.displayNamePlaceholder')}
            autoComplete="nickname"
            maxLength={50}
            // Opened by an explicit click on Edit name, so moving focus here is expected.
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
