import { loginInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/query-client';
import { useLogin } from '../hooks';

interface LoginFormProps {
  onSuccess: () => void;
  /**
   * A provider account waits to be connected to the account with this email
   * (/login?oauth=link): the email is prefilled and the password field focused.
   */
  linkEmail?: string | undefined;
  /** Under the password: a pointer for people who signed up with a provider. */
  passwordHint?: string | undefined;
}

export function LoginForm({ onSuccess, linkEmail, passwordHint }: LoginFormProps) {
  const login = useLogin();
  const linking = linkEmail !== undefined;

  const form = useForm({
    defaultValues: { email: linkEmail ?? '', password: '' },
    // Validate on submit first, then live while the user fixes errors.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: loginInputSchema },
    onSubmit: async ({ value }) => {
      try {
        await login.mutateAsync(loginInputSchema.parse(value));
        onSuccess();
      } catch {
        // Rendered from login.error below.
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
      <FormError message={login.error ? errorMessage(login.error) : undefined} />

      <form.Field name="email">
        {(field) => (
          <TextField
            field={field}
            required
            label="Email"
            autoFocus={!linking}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            onValueChange={login.reset}
          />
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <TextField
            field={field}
            required
            label="Password"
            autoFocus={linking}
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            description={
              passwordHint ? (
                <p className="text-muted-foreground text-xs">{passwordHint}</p>
              ) : undefined
            }
            onValueChange={login.reset}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in…' : linking ? 'Log in and connect' : 'Log in'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
