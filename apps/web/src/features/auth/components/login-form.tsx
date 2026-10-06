import { loginInputSchema } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/query-client';
import { useLogin } from '../hooks';

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();

  const form = useForm({
    defaultValues: { email: '', password: '' },
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
            label="Email"
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
            label="Password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            onValueChange={login.reset}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
