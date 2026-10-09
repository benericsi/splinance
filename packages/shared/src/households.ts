import { z } from 'zod';

export const HOUSEHOLD_ROLES = ['owner', 'member'] as const;
export const householdRoleSchema = z.enum(HOUSEHOLD_ROLES);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

/**
 * Minor unit exponents: HUF 0, EUR 2. New households are always HUF until multi-currency
 * (Phase 7); EUR exists so the database enum does not need a migration then.
 */
export const CURRENCIES = ['HUF', 'EUR'] as const;
export const currencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof currencySchema>;

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(60, 'Name must be at most 60 characters');

export const createHouseholdInputSchema = z.object({
  name: householdNameSchema,
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdInputSchema>;

export const updateHouseholdInputSchema = z.object({
  name: householdNameSchema,
});

export type UpdateHouseholdInput = z.infer<typeof updateHouseholdInputSchema>;

export const updateMemberInputSchema = z.object({
  role: householdRoleSchema,
});

export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;

/** A household as seen by one member: `role` is the current user's role in it. */
export const householdSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  baseCurrency: currencySchema,
  role: householdRoleSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

export type Household = z.infer<typeof householdSchema>;

/** Members see each other's display name, not their email (data minimization). */
export const householdMemberSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  role: householdRoleSchema,
  joinedAt: z.iso.datetime({ offset: true }),
});

export type HouseholdMember = z.infer<typeof householdMemberSchema>;

export const householdDetailSchema = householdSchema.extend({
  members: z.array(householdMemberSchema),
});

export type HouseholdDetail = z.infer<typeof householdDetailSchema>;

export const householdListResponseSchema = z.object({
  households: z.array(householdSchema),
});

export type HouseholdListResponse = z.infer<typeof householdListResponseSchema>;

/** Returned by create, update and invite accept. */
export const householdResponseSchema = z.object({
  household: householdSchema,
});

export type HouseholdResponse = z.infer<typeof householdResponseSchema>;

export const householdDetailResponseSchema = z.object({
  household: householdDetailSchema,
});

export type HouseholdDetailResponse = z.infer<typeof householdDetailResponseSchema>;

export const memberResponseSchema = z.object({
  member: householdMemberSchema,
});

export type MemberResponse = z.infer<typeof memberResponseSchema>;
