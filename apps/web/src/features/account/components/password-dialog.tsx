import {
  type AccountResponse,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  requiredPasswordIssues,
  type User,
} from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { PasswordRequirements } from '@/features/auth/components/password-requirements';
import { PROVIDER_VIEWS } from '@/features/auth/providers';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useChangePassword, useStartReauth } from '../hooks';

// API errors that belong to one field, shown next to it.
const FIELD_ERRORS: Partial<Record<string, 'currentPassword' | 'newPassword'>> = {
  WRONG_PASSWORD: 'currentPassword',
  WEAK_PASSWORD: 'newPassword',
};

/** The shared rules, with the signed-in user's email and name (the API checks them again). */
function formSchema(user: User, withCurrent: boolean) {
  return z
    .object({
      currentPassword: withCurrent
        ? z.string().min(1, 'Enter your current password').max(128)
        : z.string(),
      newPassword: passwordSchema,
    })
    .superRefine(({ newPassword }, ctx) => {
      for (const message of requiredPasswordIssues(newPassword, user)) {
        ctx.addIssue({ code: 'custom', path: ['newPassword'], message });
      }
    });
}

/**
 * Change the password (the current one confirms it's you) or, for an account that signs in
 * only with a provider, set a first one. Setting needs a recent sign-in; after a while the
 * dialog asks to confirm with the provider first, which comes back here with a fresh
 * session. Every other device is signed out by the API; this one stays signed in.
 */
export function PasswordDialog({
  account,
  onClose,
  onDone,
}: {
  account: AccountResponse;
  onClose: () => void;
  /** After a successful change (replaces the modal entry). */
  onDone: () => void;
}) {
  const { user, hasPassword } = account;
  const [needsReauth, setNeedsReauth] = useState(!hasPassword && !account.recentSignIn);

  return (
    <RouteDialog
      title={hasPassword ? 'Change password' : 'Set a password'}
      description={
        hasPassword
          ? 'Other devices are signed out. You stay signed in here.'
          : `Then you can also log in with ${user.email}. Other devices are signed out.`
      }
      onClose={onClose}
    >
      {needsReauth ? (
        <ReauthPrompt account={account} redirect="/account/password" />
      ) : (
        <PasswordForm
          user={user}
          hasPassword={hasPassword}
          onDone={onDone}
          onReauthRequired={() => {
            setNeedsReauth(true);
          }}
        />
      )}
    </RouteDialog>
  );
}

/** "Confirm it's you" with a connected provider; it returns to `redirect` (the dialog). */
export function ReauthPrompt({
  account,
  redirect,
}: {
  account: AccountResponse;
  redirect: '/account/password' | '/account/delete';
}) {
  const reauth = useStartReauth();
  const leaving = reauth.isPending || reauth.isSuccess;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        For your security, confirm it&apos;s you first. You&apos;ll come right back here.
      </p>
      {account.identities.map(({ provider }) => {
        const view = PROVIDER_VIEWS[provider];
        if (!view) return null;
        return (
          <Button
            key={provider}
            variant="outline"
            size="lg"
            className="h-10 w-full"
            disabled={leaving}
            onClick={() => {
              reauth.mutate({ provider, redirect });
            }}
          >
            <view.Logo className="size-4" />
            Continue with {view.name}
          </Button>
        );
      })}
    </div>
  );
}

function PasswordForm({
  user,
  hasPassword,
  onDone,
  onReauthRequired,
}: {
  user: User;
  hasPassword: boolean;
  onDone: () => void;
  onReauthRequired: () => void;
}) {
  const change = useChangePassword();
  const schema = formSchema(user, hasPassword);

  const form = useForm({
    defaultValues: { currentPassword: '', newPassword: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      const { currentPassword, newPassword } = schema.parse(value);
      try {
        await change.mutateAsync(hasPassword ? { currentPassword, newPassword } : { newPassword });
        toast.success(
          hasPassword
            ? 'Password changed. Other devices are signed out.'
            : 'Password set. You can now also log in with your email.',
        );
        onDone();
      } catch (err) {
        // The sign-in got older than the window while the dialog was open.
        if (err instanceof ApiError && err.code === 'REAUTH_REQUIRED') onReauthRequired();
        // Anything else is rendered from change.error below.
      }
    },
  });

  const code = change.error instanceof ApiError ? change.error.code : undefined;
  const field = FIELD_ERRORS[code ?? ''];
  const serverError = field && change.error ? change.error.message : undefined;
  const formError = change.error && !field ? errorMessage(change.error) : undefined;

  return (
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
      <input type="email" name="email" autoComplete="username" value={user.email} readOnly hidden />

      {hasPassword && (
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
      )}

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
                // Opened by an explicit click when there is no current password to type first.
                autoFocus={!hasPassword}
                serverError={field === 'newPassword' ? serverError : undefined}
                // The checklist below explains every rule error.
                hideErrors={field !== 'newPassword'}
                onValueChange={change.reset}
                description={
                  <PasswordRequirements
                    password={typeof newField.state.value === 'string' ? newField.state.value : ''}
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
              {hasPassword
                ? isSubmitting
                  ? 'Changing…'
                  : 'Change password'
                : isSubmitting
                  ? 'Setting…'
                  : 'Set password'}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
