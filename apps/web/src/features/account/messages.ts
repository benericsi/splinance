import type { OAuthErrorCode } from '@splinance/shared';
import { i18n } from '@/i18n';

/** Why a connect or re-authentication came back to /account (`?oauth_error=`). */
export function accountOAuthMessage(code: OAuthErrorCode, provider: string): string {
  // A sign-up only code cannot come back here; it reads like a plain failure.
  const key = code === 'not_allowed' ? 'failed' : code;
  return i18n.t(`account:oauthError.${key}`, { provider });
}
