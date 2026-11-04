import {
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  requiredPasswordIssues,
  type User,
} from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { PasswordRequirements } from '@/features/auth/components/password-requirements';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useChangePassword } from '../hooks';

// API errors that belong to one field, shown next to it.
const FIELD_ERRORS: Partial<Record<string, 'currentPassword' | 'newPassword'>> = {
  WRONG_PASSWORD: 'currentPassword',
  WEAK_PASSWORD: 'newPassword',
};

/** The shared rules, with the signed-in user's email and name (the API checks them again). */
function formSchema(user: User) {
  return z
    .object({
      currentPassword: z.string().min(1, 'Enter your current password').max(128),
      newPassword: passwordSchema,
    })
    .superRefine(({ newPassword }, ctx) => {
      for (const message of requiredPasswordIssues(newPassword, user)) {
        ctx.addIssue({ code: 'custom', path: ['newPassword'], message });
      }
    });
}

/**
 * Change the password: the current one confirms it's you. Every other device is signed
 * out by the API; this one stays signed in.
 */
export function ChangePasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: User;
  onClose: () => void;
  /** After a successful change (replaces the modal entry). */
  onDone: () => void;
}) {
  const change = useChangePassword();
  const schema = formSchema(user);

  const form = useForm({
    defaultValues: { currentPassword: '', newPassword: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      try {
        await change.mutateAsync(schema.parse(value));
        toast.success('Password changed. Other devices are signed out.');
        onDone();
      } catch {
        // Rendered from change.error below.
      }
    },
  });

  const code = change.error instanceof ApiError ? change.error.code : undefined;
  const field = FIELD_ERRORS[code ?? ''];
  const serverError = field && change.error ? change.error.message : undefined;
  const formError = change.error && !field ? errorMessage(change.error) : undefined;

  return (
    <RouteDialog
      title="Change password"
      description="Other devices are signed out. You stay signed in here."
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError message={formError} />
        {/* Lets password managers attach the new password to the right account. */}
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={user.email}
          readOnly
          hidden
        />

        <form.Field name="currentPassword">
          {(currentField) => (
            <TextField
              field={currentField}
              required
              label="Current password"
              type="password"
              placeholder="Your current password"
              autoComplete="current-password"
              maxLength={128}
              serverError={field === 'currentPassword' ? serverError : undefined}
              onValueChange={change.reset}
            />
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.submissionAttempts > 0}>
          {(attempted) => (
            <form.Field name="newPassword">
              {(newField) => (
                <TextField
                  field={newField}
                  required
                  label="New password"
                  type="password"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  serverError={field === 'newPassword' ? serverError : undefined}
                  // The checklist below explains every rule error.
                  hideErrors={field !== 'newPassword'}
                  onValueChange={change.reset}
                  description={
                    <PasswordRequirements
                      password={
                        typeof newField.state.value === 'string' ? newField.state.value : ''
                      }
                      context={user}
                      showFailures={attempted}
                    />
                  }
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex justify-end pt-1">
              <Button type="submit" size="lg" className="min-w-28" disabled={isSubmitting}>
                {isSubmitting ? 'Changing…' : 'Change password'}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </RouteDialog>
  );
}
