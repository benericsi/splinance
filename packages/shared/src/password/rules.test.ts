import { describe, expect, it } from 'vitest';
import { registerInputSchema } from '../auth';
import { checkPassword, type PasswordRuleId } from './rules';

function passed(password: string, context = {}): Record<PasswordRuleId, boolean> {
  return Object.fromEntries(
    checkPassword(password, context).map(({ rule, passed }) => [rule.id, passed]),
  ) as Record<PasswordRuleId, boolean>;
}

describe('checkPassword', () => {
  it('accepts a long passphrase without composition (recommended rules are hints)', () => {
    expect(passed('correct horse battery staple')).toEqual({
      minLength: true,
      notPersonal: true,
      notCommon: true,
      lowercase: true,
      uppercase: false,
      number: false,
    });
  });

  it('passes nothing for an empty password', () => {
    expect(Object.values(passed(''))).not.toContain(true);
  });

  it('flags passwords containing the email local part or display name', () => {
    const context = { email: 'anna.kovacs@example.com', displayName: 'Anna' };
    expect(passed('my-ANNA.KOVACS-secret', context).notPersonal).toBe(false);
    expect(passed('xx-anna-forever-xx', context).notPersonal).toBe(false);
    expect(passed('totally unrelated words', context).notPersonal).toBe(true);
  });

  it('ignores personal fragments shorter than 3 characters', () => {
    expect(passed('albatross wings', { displayName: 'Al' }).notPersonal).toBe(true);
  });

  it('rejects common passwords case-insensitively', () => {
    expect(passed('QWERTYUIOP').notCommon).toBe(false);
    expect(passed('1234567890').notCommon).toBe(false);
  });

  it('recognizes non-ASCII letters for the case hints', () => {
    expect(passed('Árvíztűrő tükörfúrógép')).toMatchObject({ lowercase: true, uppercase: true });
  });
});

describe('registerInputSchema password rules', () => {
  const base = { email: 'anna@example.com', displayName: 'Anna' };

  it.each([
    ['qwertyuiop', 'This password is too common, choose another one'],
    ['anna-loves-budgets', 'Password must not contain your email or name'],
  ])('rejects %s', (password, message) => {
    const result = registerInputSchema.safeParse({ ...base, password });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ['password'], message }),
    );
  });

  it('does not require uppercase letters or numbers', () => {
    expect(
      registerInputSchema.safeParse({ ...base, password: 'correct horse battery' }).success,
    ).toBe(true);
  });
});
