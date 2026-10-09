import { ApiError } from '@/lib/http';

interface InviteProblem {
  title: string;
  description: string;
}

const PROBLEMS: Record<string, InviteProblem> = {
  INVITE_NOT_FOUND: {
    title: 'This invite link does not work',
    description: 'It may be incomplete, or the household was archived. Ask for a new link.',
  },
  INVITE_EXPIRED: {
    title: 'This invite has expired',
    description: 'Invite links work for 7 days. Ask for a new one.',
  },
  INVITE_USED: {
    title: 'This invite was already used',
    description: 'Each link works once. Ask for a new one.',
  },
  INVITE_REVOKED: {
    title: 'This invite was revoked',
    description: 'The household owner cancelled it. Ask for a new link.',
  },
};

/** Why an invite cannot be used, phrased for the person holding the link. */
export function inviteProblem(error: unknown): InviteProblem {
  const known = error instanceof ApiError ? PROBLEMS[error.code] : undefined;
  return (
    known ?? {
      title: 'Something went wrong',
      description: 'The invite could not be loaded. Try again in a moment.',
    }
  );
}
