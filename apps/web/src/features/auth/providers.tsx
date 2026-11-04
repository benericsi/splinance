import type { OAuthErrorCode } from '@splinance/shared';
import type { ComponentType } from 'react';
import { GoogleMark } from '@/components/brand/provider-logos';

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

/** Why a provider sign-in came back to /login (`?oauth_error=`). */
export const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  cancelled: 'Google sign-in was cancelled.',
  not_allowed: 'Sign-ups are invite-only for now.',
  email_unverified:
    "Your Google account's email isn't verified. Verify it with Google, or use a password.",
  expired: 'That sign-in took too long or was started in another tab. Try again.',
  conflict: 'This email is connected to another sign-in. Log in with your password.',
  unavailable: "Google sign-in isn't available right now. Use your password or try again later.",
  failed: "Google sign-in didn't work. Try again.",
};
