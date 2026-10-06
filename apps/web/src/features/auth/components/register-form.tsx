import { PASSWORD_MAX_LENGTH, registerInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useRegister } from '../hooks';
import { PasswordRequirements } from './password-requirements';

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const register = useRegister();

  const form = useForm({
    defaultValues: { displayName: '', email: '', password: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: registerInputSchema },
    onSubmit: async ({ value }) => {
      try {
        await register.mutateAsync(registerInputSchema.parse(value));
        onSuccess();
      } catch {
        // Rendered from register.error below.
      }
    },
  });

  // Field-specific API errors go next to the field; everything else above the form.
  const emailTaken = register.error instanceof ApiError && register.error.code === 'EMAIL_TAKEN';
  const formError = register.error && !emailTaken ? errorMessage(register.error) : undefined;

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

      <form.Field name="displayName">
        {(field) => (
          <TextField
            field={field}
            label="Display name"
            placeholder="e.g. Anna"
            autoComplete="nickname"
          />
        )}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <TextField
            field={field}
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            serverError={emailTaken ? 'An account with this email already exists' : undefined}
            onValueChange={register.reset}
          />
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({
          email: state.values.email,
          displayName: state.values.displayName,
          attempted: state.submissionAttempts > 0,
        })}
      >
        {({ email, displayName, attempted }) => (
          <form.Field name="password">
            {(field) => (
              <TextField
                field={field}
                label="Password"
                type="password"
                placeholder="Create a password"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX_LENGTH}
                // The checklist below explains every password error.
                hideErrors
                description={
                  <PasswordRequirements
                    password={typeof field.state.value === 'string' ? field.state.value : ''}
                    context={{ email, displayName }}
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
          <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
