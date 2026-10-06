import { COMMON_PASSWORDS } from './common-passwords';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Personal details a password must not contain. */
export interface PasswordContext {
  email?: string | undefined;
  displayName?: string | undefined;
}

export type PasswordRuleId =
  'minLength' | 'notPersonal' | 'notCommon' | 'lowercase' | 'uppercase' | 'number';

export interface PasswordRule {
  id: PasswordRuleId;
  /** Checklist text in the UI. */
  label: string;
  /**
   * Required rules block registration (enforced by the API too). Recommended rules
   * are hints only: NIST SP 800-63B advises against mandatory composition rules.
   */
  required: boolean;
  /** Validation message when a required rule fails. */
  message: string;
  test: (password: string, context: PasswordContext) => boolean;
}

// Ignore very short fragments: "Al" inside a password is not a real leak.
const MIN_PERSONAL_FRAGMENT = 3;

function personalFragments({ email, displayName }: PasswordContext): string[] {
  const localPart = email?.split('@')[0];
  return [localPart, displayName]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => !!value && value.length >= MIN_PERSONAL_FRAGMENT);
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'minLength',
    label: `At least ${String(PASSWORD_MIN_LENGTH)} characters`,
    required: true,
    message: `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'notPersonal',
    label: 'Does not contain your email or name',
    required: true,
    message: 'Password must not contain your email or name',
    test: (password, context) => {
      // Nothing typed yet is not a pass.
      if (password.length === 0) return false;
      const lower = password.toLowerCase();
      return !personalFragments(context).some((fragment) => lower.includes(fragment));
    },
  },
  {
    id: 'notCommon',
    label: 'Not a commonly used password',
    required: true,
    message: 'This password is too common, choose another one',
    test: (password) => password.length > 0 && !COMMON_PASSWORDS.has(password.toLowerCase()),
  },
  {
    id: 'lowercase',
    label: 'A lowercase letter',
    required: false,
    message: '',
    test: (password) => /\p{Ll}/u.test(password),
  },
  {
    id: 'uppercase',
    label: 'An uppercase letter',
    required: false,
    message: '',
    test: (password) => /\p{Lu}/u.test(password),
  },
  {
    id: 'number',
    label: 'A number',
    required: false,
    message: '',
    test: (password) => /\d/.test(password),
  },
];

export interface PasswordRuleResult {
  rule: PasswordRule;
  passed: boolean;
}

export function checkPassword(
  password: string,
  context: PasswordContext = {},
): PasswordRuleResult[] {
  return PASSWORD_RULES.map((rule) => ({ rule, passed: rule.test(password, context) }));
}
