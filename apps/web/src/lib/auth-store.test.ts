import { afterEach, describe, expect, it } from 'vitest';
import { testUser } from '../../test/utils';
import { authStore, resetAuthStore } from './auth-store';

afterEach(() => {
  resetAuthStore();
});

describe('authStore.clear', () => {
  it('keeps a deliberate end when a later request fails', () => {
    authStore.setSession('access-1', testUser);
    authStore.clear('deleted');
    // A page still refetching while the router leaves it: its refresh fails.
    authStore.clear();
    expect(authStore.getState().endedBy).toBe('deleted');
  });

  it('marks a session that ran out as expired', () => {
    authStore.setSession('access-1', testUser);
    authStore.clear();
    expect(authStore.getState().endedBy).toBe('expired');
  });
});
