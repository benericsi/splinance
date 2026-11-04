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
  /**
   * Whether this session signed in recently enough for changes that need no password
   * (an account without one sets its first password); otherwise it re-authenticates first.
   */
  recentSignIn: z.boolean(),
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

/** Step-up for connect and disconnect: required when the account has a password. */
export const stepUpInputSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128).optional(),
});

export type StepUpInput = z.infer<typeof stepUpInputSchema>;

/** POST /api/account/identities/:provider/reauth: where to come back afterwards. */
export const reauthInputSchema = z.object({
  redirect: z.string().max(512).optional(),
});

export type ReauthInput = z.infer<typeof reauthInputSchema>;

/**
 * Connect and reauth answer with the provider's authorization URL; the web navigates there
 * (the flow cookie set by the same response carries who started it).
 */
export const providerRedirectResponseSchema = z.object({
  authorizationUrl: z.url().max(4096),
});

export type ProviderRedirectResponse = z.infer<typeof providerRedirectResponseSchema>;

/** A household as the deletion preview names it. */
const deletionHouseholdSchema = z.object({
  householdId: z.uuid(),
  householdName: z.string().max(60),
});

/**
 * GET /api/account/deletion: what deleting the account would do, and what stops it.
 * Blockers must be resolved first (settle up, hand over ownership); nothing is half done.
 */
export const accountDeletionPreviewSchema = z.object({
  blockers: z
    .array(deletionHouseholdSchema.extend({ code: z.enum(['UNSETTLED_BALANCE', 'LAST_OWNER']) }))
    .max(200),
  /** Households shared with others: the person leaves, their shared entries stay. */
  leaves: z.array(deletionHouseholdSchema).max(200),
  /** Households nobody else was ever in: deleted with everything in them. */
  deletes: z.array(deletionHouseholdSchema).max(200),
  /** Households only former members were in besides the person: archived. */
  archives: z.array(deletionHouseholdSchema).max(200),
  /** Private transactions, erased (only their author could ever read them). */
  privateTransactionCount: z.number().int().nonnegative(),
});

export type AccountDeletionPreview = z.infer<typeof accountDeletionPreviewSchema>;

/** POST /api/account/delete: step-up plus the email typed again. */
export const deleteAccountInputSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128).optional(),
  confirmEmail: z.string().trim().toLowerCase().max(254),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;
