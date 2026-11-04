import { describe, expect, it } from 'vitest';
import { redactUrl } from './redact-url';

describe('redactUrl', () => {
  it('hides invite tokens', () => {
    expect(redactUrl('/api/invites/abc_DEF-123')).toBe('/api/invites/[redacted]');
    expect(redactUrl('/api/invites/abc_DEF-123/accept')).toBe('/api/invites/[redacted]/accept');
    expect(redactUrl('/api/invites/abc?x=1')).toBe('/api/invites/[redacted]?x=1');
  });

  it('hides the whole query of a provider callback', () => {
    expect(redactUrl('/api/auth/oauth/google/callback?state=s&code=4/0Ab-x&scope=openid')).toBe(
      '/api/auth/oauth/google/callback?[redacted]',
    );
    expect(redactUrl('/api/auth/oauth/google/callback')).toBe('/api/auth/oauth/google/callback');
    expect(redactUrl('/api/auth/oauth/google/start?redirect=/h/1')).toBe(
      '/api/auth/oauth/google/start?redirect=/h/1',
    );
  });

  it('leaves other urls alone', () => {
    const url = '/api/households/0199c3b2-7a4e-7cde-8f00-000000000001/invites/x';
    expect(redactUrl(url)).toBe(url);
    expect(redactUrl('/api/me')).toBe('/api/me');
  });
});
