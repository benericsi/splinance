import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { testUser } from '../../test/utils';
import { authStore, resetAuthStore } from './auth-store';
import { clearCacheOnUserChange } from './session-watch';

const otherUser = { ...testUser, id: '01a112be-f8eb-73bb-b534-400e393821c4', displayName: 'Ben' };

let stop = () => {};
afterEach(() => {
  stop();
  resetAuthStore();
});

function cachedClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['households'], [{ id: 'h1', name: "Anna's home" }]);
  return queryClient;
}

describe('clearCacheOnUserChange', () => {
  it('forgets the previous person when a session runs out and someone else signs in', () => {
    authStore.setSession('access-a', testUser);
    const queryClient = cachedClient();
    stop = clearCacheOnUserChange(authStore, queryClient);

    authStore.clear('expired');
    expect(queryClient.getQueryCache().getAll()).toEqual([]);

    // Whatever was fetched in between (sign-in providers) goes too when Ben signs in.
    queryClient.setQueryData(['auth', 'providers'], []);
    authStore.setSession('access-b', otherUser);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('clears when the signed-in person changes without a sign-out in between', () => {
    authStore.setSession('access-a', testUser);
    const queryClient = cachedClient();
    stop = clearCacheOnUserChange(authStore, queryClient);

    authStore.setSession('access-b', otherUser);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('keeps the cache across a token refresh or a rename of the same person', () => {
    authStore.setSession('access-a', testUser);
    const queryClient = cachedClient();
    stop = clearCacheOnUserChange(authStore, queryClient);

    authStore.setSession('access-a2', testUser);
    authStore.setUser({ ...testUser, displayName: 'Anna B' });
    expect(queryClient.getQueryData(['households'])).toBeDefined();
  });
});
