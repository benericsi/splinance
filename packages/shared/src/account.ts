import { z } from 'zod';
import { displayNameSchema, passwordSchema, userSchema } from './auth';
import { oauthProviderIdSchema } from './oauth';

/** A sign-in provider account connected to the user (`user_identities`). */
export const accountIdentitySchema = z.object({
  provider: oauthProviderIdSchema,
  connectedAt: z.iso.datetime({ offset: true }),
  lastUsedAt: z.iso.datetime({ offset: true }),
});

export type AccountIdentity = z.infer<typeof accountIdentitySchema>;

/** GET /api/account: the profile and every way the user can sign in. */
export const accountResponseSchema = z.object({
  user: userSchema,
  hasPassword: z.boolean(),
  identities: z.array(accountIdentitySchema).max(10),
  /** Providers configured on this instance (what could be connected); empty on the demo. */
  providers: z.array(z.object({ id: oauthProviderIdSchema })).max(10),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;

/** PATCH /api/account */
export const updateProfileInputSchema = z.object({
  displayName: displayNameSchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const profileResponseSchema = z.object({
  user: userSchema,
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

/**
 * POST /api/account/password: change the password (the current one is required when the
 * account has one) or set a first one. The required password rules need the account's
 * email and name, so the API checks them against its own copy, the web against the
 * signed-in user (`requiredPasswordIssues`).
 */
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128).optional(),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

/** POST /api/account/sessions/revoke-others */
export const revokeSessionsResponseSchema = z.object({
  /** How many other sessions were signed out. */
  revoked: z.number().int().nonnegative(),
});

export type RevokeSessionsResponse = z.infer<typeof revokeSessionsResponseSchema>;
