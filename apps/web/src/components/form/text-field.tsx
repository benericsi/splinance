import type { AnyFieldApi } from '@tanstack/react-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Validators may report strings or Standard Schema issues ({ message }). */
function errorText(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return undefined;
}

interface TextFieldProps {
  field: AnyFieldApi;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  /** An error from the API for this field, shown instead of validation errors. */
  serverError?: string | undefined;
  onValueChange?: () => void;
}

export function TextField({
  field,
  label,
  type = 'text',
  autoComplete,
  serverError,
  onValueChange,
}: TextFieldProps) {
  // AnyFieldApi types name and value as any; this component only handles string fields.
  const name = String(field.name);
  const value = typeof field.state.value === 'string' ? field.state.value : '';
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const errors = serverError
    ? [serverError]
    : field.state.meta.errors.map(errorText).filter((e): e is string => Boolean(e));
  const invalid = errors.length > 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onBlur={field.handleBlur}
        onChange={(e) => {
          field.handleChange(e.target.value);
          onValueChange?.();
        }}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
      />
      {invalid && (
        <p id={errorId} className="text-destructive text-sm">
          {errors[0]}
        </p>
      )}
    </div>
  );
}
