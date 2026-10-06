import { describe, expect, it } from 'vitest';
import { loginInputSchema, registerInputSchema } from './auth';

describe('registerInputSchema', () => {
  it('normalizes email and trims the display name', () => {
    expect(
      registerInputSchema.parse({
        email: '  Anna@Example.COM ',
        password: 'correct horse battery',
        displayName: '  Anna ',
      }),
    ).toEqual({
      email: 'anna@example.com',
      password: 'correct horse battery',
      displayName: 'Anna',
    });
  });

  it('rejects short passwords and empty display names', () => {
    const result = registerInputSchema.safeParse({
      email: 'anna@example.com',
      password: 'short',
      displayName: '   ',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['password', 'Password must be at least 10 characters'],
      ['displayName', 'Display name is required'],
    ]);
  });
});

describe('loginInputSchema', () => {
  it('does not apply the password length policy', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});
