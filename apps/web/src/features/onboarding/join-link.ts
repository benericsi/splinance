import { inviteTokenSchema } from '@splinance/shared';
import { z } from 'zod';
import { i18n } from '@/i18n';

/** Takes what people paste: the whole link (`.../invite#<token>`) or just the token. */
export function tokenFromInviteLink(input: string): string {
  const value = input.trim();
  const hash = value.lastIndexOf('#');
  return hash === -1 ? value : value.slice(hash + 1);
}

// Messages resolve when the form validates, in the current language.
export const joinLinkInputSchema = z.object({
  link: z
    .string()
    .trim()
    .min(1, { error: () => i18n.t('onboarding:join.required') })
    .transform(tokenFromInviteLink)
    .refine((token) => inviteTokenSchema.safeParse(token).success, {
      error: () => i18n.t('onboarding:join.invalid'),
    }),
});
