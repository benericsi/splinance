import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';

/**
 * The current password inside a confirmation (connect, disconnect): one field, so plain
 * local state instead of a form, with the same show/hide toggle as the forms' fields.
 */
export function CurrentPasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Current password</Label>
      <InputGroup className="h-10">
        <InputGroupInput
          id={id}
          type={revealed ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Your current password"
          maxLength={128}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          aria-invalid={error !== undefined}
          aria-describedby={error ? errorId : undefined}
        />
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
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
