import { i18n } from '@/i18n';
import { ApiError } from '@/lib/http';

interface InviteProblem {
  title: string;
  description: string;
}

const INVITE_CODES = [
  'INVITE_NOT_FOUND',
  'INVITE_EXPIRED',
  'INVITE_USED',
  'INVITE_REVOKED',
] as const;
type InviteCode = (typeof INVITE_CODES)[number];

const isInviteCode = (code: string): code is InviteCode =>
  (INVITE_CODES as readonly string[]).includes(code);

/** Why an invite cannot be used, phrased for the person holding the link. */
export function inviteProblem(error: unknown): InviteProblem {
  const key = error instanceof ApiError && isInviteCode(error.code) ? error.code : 'other';
  return {
    title: i18n.t(`invites:problems.${key}.title`),
    description: i18n.t(`invites:problems.${key}.description`),
  };
}
