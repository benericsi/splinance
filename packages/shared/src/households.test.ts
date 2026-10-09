import { describe, expect, it } from 'vitest';
import { createHouseholdInputSchema, householdSchema, updateMemberInputSchema } from './households';
import { inviteTokenSchema } from './invites';

describe('createHouseholdInputSchema', () => {
  it('trims the name', () => {
    expect(createHouseholdInputSchema.parse({ name: '  Otthon ' })).toEqual({ name: 'Otthon' });
  });

  it('rejects blank and too long names', () => {
    expect(createHouseholdInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createHouseholdInputSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
    expect(createHouseholdInputSchema.safeParse({ name: 'x'.repeat(60) }).success).toBe(true);
  });
});

describe('updateMemberInputSchema', () => {
  it('accepts only known roles', () => {
    expect(updateMemberInputSchema.safeParse({ role: 'owner' }).success).toBe(true);
    expect(updateMemberInputSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });
});

describe('householdSchema', () => {
  it('rejects unknown currencies', () => {
    const household = {
      id: '0199c3b2-7a4e-7cde-8f00-000000000001',
      name: 'Otthon',
      baseCurrency: 'HUF',
      role: 'owner',
      createdAt: '2026-10-09T12:00:00.000Z',
    };
    expect(householdSchema.safeParse(household).success).toBe(true);
    expect(householdSchema.safeParse({ ...household, baseCurrency: 'USD' }).success).toBe(false);
  });
});

describe('inviteTokenSchema', () => {
  it('accepts 43 base64url characters only', () => {
    expect(inviteTokenSchema.safeParse('a'.repeat(43)).success).toBe(true);
    expect(inviteTokenSchema.safeParse('a'.repeat(42)).success).toBe(false);
    expect(inviteTokenSchema.safeParse(`${'a'.repeat(42)}/`).success).toBe(false);
  });
});
