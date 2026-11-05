import type { OAuthErrorCode } from '@splinance/shared';
import type { ComponentType } from 'react';
import { GoogleMark } from '@/components/brand/provider-logos';
import { i18n } from '@/i18n';

interface ProviderView {
  /** As in "Google is now connected". */
  name: string;
  Logo: ComponentType<{ className?: string }>;
}

/**
 * How each sign-in provider looks. The API decides which ones are on (GET /auth/providers);
 * an id it lists without an entry here is not shown. A new provider: an entry here plus its
 * API config (architecture.md section 6).
 */
export const PROVIDER_VIEWS: Partial<Record<string, ProviderView>> = {
  google: { name: 'Google', Logo: GoogleMark },
};

/** The API's sign-in start, a full-page navigation (never a router link or fetch). */
export function providerStartHref(providerId: string, redirect: string | undefined): string {
  const base = `/api/auth/oauth/${encodeURIComponent(providerId)}/start`;
  return redirect ? `${base}?${new URLSearchParams({ redirect }).toString()}` : base;
}

/** Why a provider sign-in came back to /login (`?oauth_error=`), in the UI language. */
export function oauthErrorMessage(code: OAuthErrorCode): string {
  // Only Google exists today; a second provider would carry its id in the error too.
  return i18n.t(`auth:oauthError.${code}`, { provider: 'Google' });
}
