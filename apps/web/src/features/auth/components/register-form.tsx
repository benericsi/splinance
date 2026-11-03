import { PASSWORD_MAX_LENGTH, registerInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useRegister } from '../hooks';
import { PasswordRequirements } from './password-requirements';

// API errors that are about the email, shown next to the field.
const EMAIL_ERRORS: Partial<Record<string, string>> = {
  EMAIL_TAKEN: 'An account with this email already exists',
  // Production lets only allowlisted emails sign up.
  REGISTRATION_CLOSED: 'Sign-ups are invite-only for now',
};

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
  const code = register.error instanceof ApiError ? register.error.code : undefined;
  const emailError = EMAIL_ERRORS[code ?? ''];
  const formError = register.error && !emailError ? errorMessage(register.error) : undefined;

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
            required
            label="Display name"
            autoFocus
            placeholder="e.g. Anna"
            autoComplete="nickname"
          />
        )}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <TextField
            field={field}
            required
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            serverError={emailError}
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
                required
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
