import { inviteTokenSchema } from '@splinance/shared';
import { z } from 'zod';

/** Takes what people paste: the whole link (`.../invite#<token>`) or just the token. */
export function tokenFromInviteLink(input: string): string {
  const value = input.trim();
  const hash = value.lastIndexOf('#');
  return hash === -1 ? value : value.slice(hash + 1);
}

export const joinLinkInputSchema = z.object({
  link: z
    .string()
    .trim()
    .min(1, 'Paste the invite link you received')
    .transform(tokenFromInviteLink)
    .refine((token) => inviteTokenSchema.safeParse(token).success, {
      message: "That doesn't look like an invite link",
    }),
});
