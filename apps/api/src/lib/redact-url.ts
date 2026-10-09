/** Invite tokens travel in the path (/api/invites/:token); keep them out of request logs. */
export function redactUrl(url: string): string {
  return url.replace(/^(\/api\/invites\/)[^/?#]+/, '$1[redacted]');
}
