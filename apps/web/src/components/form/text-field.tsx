import type { AnyFieldApi } from '@tanstack/react-form';
import { Eye, EyeOff } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
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
  type?: 'text' | 'email' | 'password' | 'date';
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  /** Only for the first field of a single-purpose page (login, register). */
  autoFocus?: boolean;
  /** Marks the label with a red asterisk and sets aria-required. */
  required?: boolean;
  /** An error from the API for this field, shown instead of validation errors. */
  serverError?: string | undefined;
  /** Hide validation errors, e.g. when a live checklist already explains them. */
  hideErrors?: boolean;
  /** Extra content under the input, linked via aria-describedby. */
  description?: ReactNode;
  onValueChange?: () => void;
}

export function TextField({
  field,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  maxLength,
  autoFocus,
  required = false,
  serverError,
  hideErrors = false,
  description,
  onValueChange,
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);

  // AnyFieldApi types name and value as any; this component only handles string fields.
  const name = String(field.name);
  const value = typeof field.state.value === 'string' ? field.state.value : '';
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;

  const errors = serverError
    ? [serverError]
    : hideErrors
      ? []
      : field.state.meta.errors.map(errorText).filter((e): e is string => Boolean(e));
  const invalid = serverError !== undefined || field.state.meta.errors.length > 0;
  const describedBy =
    [errors.length > 0 && errorId, description && descriptionId].filter(Boolean).join(' ') ||
    undefined;

  const inputProps = {
    id,
    name,
    placeholder,
    autoComplete,
    maxLength,
    autoFocus,
    value,
    onBlur: field.handleBlur,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      field.handleChange(e.target.value);
      onValueChange?.();
    },
    'aria-required': required || undefined,
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {/* Visual cue only; screen readers get aria-required on the input. */}
        {required && (
          <span aria-hidden className="text-destructive -ml-1">
            *
          </span>
        )}
      </Label>
      {type === 'password' ? (
        <InputGroup className="h-10">
          <InputGroupInput {...inputProps} type={revealed ? 'text' : 'password'} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={revealed ? 'Hide password' : 'Show password'}
              aria-pressed={revealed}
              onClick={() => {
                setRevealed((r) => !r);
              }}
            >
              {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...inputProps} type={type} className="h-10" />
      )}
      {errors.length > 0 && (
        <p id={errorId} className="text-destructive text-sm">
          {errors[0]}
        </p>
      )}
      {description && <div id={descriptionId}>{description}</div>}
    </div>
  );
}
