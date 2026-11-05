import { afterEach, describe, expect, it } from 'vitest';
import { passwordSchema } from '../auth';
import { householdNameSchema } from '../households';
import { checkPassword } from '../password/rules';
import { transactionInputSchema } from '../transactions';
import { LOCALES, matchLocale } from './locales';
import { setValidationLocale, VALIDATION_MESSAGES, vm } from './validation';

afterEach(() => {
  setValidationLocale('en');
});

describe('matchLocale', () => {
  it('maps browser tags to a supported language', () => {
    expect(matchLocale('hu-HU')).toBe('hu');
    expect(matchLocale('HU')).toBe('hu');
    expect(matchLocale('en_GB')).toBe('en');
    expect(matchLocale('de-DE')).toBeUndefined();
    expect(matchLocale('')).toBeUndefined();
    expect(matchLocale(undefined)).toBeUndefined();
  });
});

describe('validation messages', () => {
  it('has every message in every language, none empty', () => {
    const keys = Object.keys(VALIDATION_MESSAGES.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(VALIDATION_MESSAGES[locale]).sort()).toEqual(keys);
      for (const message of Object.values(VALIDATION_MESSAGES[locale])) {
        const text = typeof message === 'function' ? message(7) : message;
        expect(text.trim()).not.toBe('');
        if (typeof message === 'function') expect(text).toContain('7');
      }
    }
  });

  it('resolves when a schema validates, so the language can change at runtime', () => {
    const issue = () => householdNameSchema.safeParse('').error?.issues[0]?.message;
    expect(issue()).toBe('Name is required');
    setValidationLocale('hu');
    expect(issue()).toBe('Add meg a nevet');
    expect(passwordSchema.safeParse('short').error?.issues[0]?.message).toBe(
      'A jelszó legalább 10 karakter legyen',
    );
  });

  it('translates split problems and password rule labels', () => {
    setValidationLocale('hu');
    const result = transactionInputSchema.safeParse({
      kind: 'expense',
      amount: 100,
      occurredOn: '2026-11-05',
      description: 'Bolt',
      categoryId: null,
      visibility: 'shared',
      paidBy: '0190a0a0-0000-7000-8000-000000000001',
      split: { method: 'equal', userIds: [] },
    });
    expect(result.error?.issues.map((i) => i.message)).toContain(vm('split.no-members'));
    expect(checkPassword('')[0]?.rule.label).toBe('Legalább 10 karakter');
  });
});
