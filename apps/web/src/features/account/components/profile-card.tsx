import { type User, updateProfileInputSchema } from '@splinance/shared';
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
                  Edit name
                </Button>
              )}
            </>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Your email is used to sign in. It can&apos;t be changed yet.
        </p>
      </CardContent>
    </Card>
  );
}

function RenameForm({ user, onDone }: { user: User; onDone: () => void }) {
  const update = useUpdateProfile();

  const form = useForm({
    defaultValues: { displayName: user.displayName },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: updateProfileInputSchema },
    onSubmit: async ({ value }) => {
      try {
        const input = updateProfileInputSchema.parse(value);
        if (input.displayName !== user.displayName) {
          await update.mutateAsync(input);
          toast.success('Name changed');
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
      aria-label="Edit name"
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
            label="Display name"
            placeholder="Anna"
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
