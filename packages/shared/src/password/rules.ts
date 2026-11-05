import { vm } from '../i18n/validation';
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
  /** Checklist text in the UI, in the current language (a getter). */
  readonly label: string;
  /**
   * Required rules block registration (enforced by the API too). Recommended rules
   * are hints only: NIST SP 800-63B advises against mandatory composition rules.
   */
  required: boolean;
  /** Validation message when a required rule fails, in the current language. */
  readonly message: string;
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
    get label() {
      return vm('passwordRule.minLength', PASSWORD_MIN_LENGTH);
    },
    required: true,
    get message() {
      return vm('password.tooShort', PASSWORD_MIN_LENGTH);
    },
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'notPersonal',
    get label() {
      return vm('passwordRule.notPersonal');
    },
    required: true,
    get message() {
      return vm('password.personal');
    },
    test: (password, context) => {
      // Nothing typed yet is not a pass.
      if (password.length === 0) return false;
      const lower = password.toLowerCase();
      return !personalFragments(context).some((fragment) => lower.includes(fragment));
    },
  },
  {
    id: 'notCommon',
    get label() {
      return vm('passwordRule.notCommon');
    },
    required: true,
    get message() {
      return vm('password.common');
    },
    test: (password) => password.length > 0 && !COMMON_PASSWORDS.has(password.toLowerCase()),
  },
  {
    id: 'lowercase',
    get label() {
      return vm('passwordRule.lowercase');
    },
    required: false,
    message: '',
    test: (password) => /\p{Ll}/u.test(password),
  },
  {
    id: 'uppercase',
    get label() {
      return vm('passwordRule.uppercase');
    },
    required: false,
    message: '',
    test: (password) => /\p{Lu}/u.test(password),
  },
  {
    id: 'number',
    get label() {
      return vm('passwordRule.number');
    },
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

/**
 * Messages of the required rules a password breaks, besides its length (`passwordSchema`
 * covers that). Used wherever a new password is chosen: registration and account settings,
 * on the web and again on the API.
 */
export function requiredPasswordIssues(password: string, context: PasswordContext): string[] {
  return PASSWORD_RULES.filter(
    (rule) => rule.required && rule.id !== 'minLength' && !rule.test(password, context),
  ).map((rule) => rule.message);
}
