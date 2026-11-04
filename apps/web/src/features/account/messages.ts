import type { OAuthErrorCode } from '@splinance/shared';

/** Why a connect or re-authentication came back to /account (`?oauth_error=`). */
export function accountOAuthMessage(code: OAuthErrorCode, provider: string): string {
  switch (code) {
    case 'cancelled':
      return `You cancelled at ${provider}. Nothing changed.`;
    case 'taken':
      return `That ${provider} account is already used by another Splinance account.`;
    case 'conflict':
      return `Another ${provider} account is connected. Disconnect it first.`;
    case 'wrong_account':
      return `That's a different ${provider} account than the one connected here. Try again with that one.`;
    case 'email_unverified':
      return `Your ${provider} account's email isn't verified. Verify it with ${provider} first.`;
    case 'expired':
      return 'That took too long or was started in another tab. Try again.';
    case 'unavailable':
      return `${provider} isn't available right now. Try again later.`;
    case 'not_allowed':
    case 'failed':
      return `That didn't work with ${provider}. Try again.`;
  }
}
