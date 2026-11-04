/**
 * Credentials in URLs stay out of request logs: invite tokens travel in the path
 * (/api/invites/:token), and a provider's callback carries the authorization code and state
 * in its query (/api/auth/oauth/:provider/callback?code=...&state=...), redacted whole.
 */
export function redactUrl(url: string): string {
  return url
    .replace(/^(\/api\/invites\/)[^/?#]+/, '$1[redacted]')
    .replace(/^(\/api\/auth\/oauth\/[^/?#]+\/callback)\?.*$/, '$1?[redacted]');
}
