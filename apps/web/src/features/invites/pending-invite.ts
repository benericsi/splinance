/**
 * Invite links carry the token in the URL fragment (`/invite#<token>`), which browsers
 * never send to a server or in a Referer header. To survive login or registration it is
 * kept in sessionStorage (this tab only) instead of a `?redirect=` query, which would reach
 * the server. Cleared once the invite is accepted.
 */
const KEY = 'splinance-pending-invite';

export function stashInviteToken(token: string): boolean {
  try {
    sessionStorage.setItem(KEY, token);
    return true;
  } catch {
    // Storage blocked: the caller keeps the token in the URL instead.
    return false;
  }
}

export function readInviteToken(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearInviteToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function inviteLink(token: string): string {
  return `${window.location.origin}/invite#${token}`;
}
