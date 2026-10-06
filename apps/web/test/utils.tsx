import type { User } from '@splinance/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Renders with a fresh QueryClient so tests never share cached data. */
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

export const testUser: User = {
  id: '01a112be-f8eb-73bb-b534-400e393821c3',
  email: 'anna@example.com',
  displayName: 'Anna',
  createdAt: '2026-10-06T19:44:27.880Z',
};

export function authResponse(accessToken = 'access-1', user: User = testUser) {
  return { accessToken, user };
}

export function apiError(code: string, message = code) {
  return { error: { code, message } };
}
