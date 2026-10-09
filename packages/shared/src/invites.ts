import { z } from 'zod';

export const INVITE_TTL_DAYS = 7;

/** 32 random bytes, base64url without padding. Anything else cannot be a real token. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid invite token');

export const inviteSchema = z.object({
  id: z.uuid(),
  invitedBy: z.object({
    userId: z.uuid(),
    displayName: z.string(),
  }),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type Invite = z.infer<typeof inviteSchema>;

/**
 * The raw token is returned exactly once, at creation; only its hash is stored.
 * The web app builds the invite link (and QR code) from it.
 */
export const createInviteResponseSchema = z.object({
  invite: inviteSchema,
  token: inviteTokenSchema,
});

export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

/** Pending invites only: not accepted, not revoked, not expired. */
export const inviteListResponseSchema = z.object({
  invites: z.array(inviteSchema),
});

export type InviteListResponse = z.infer<typeof inviteListResponseSchema>;

/** Public preview for whoever holds the link: just enough to decide whether to join. */
export const invitePreviewSchema = z.object({
  householdName: z.string(),
  invitedBy: z.object({ displayName: z.string() }),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const invitePreviewResponseSchema = z.object({
  invite: invitePreviewSchema,
});

export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;
