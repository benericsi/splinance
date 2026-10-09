import type { Household, HouseholdDetail, User } from '@splinance/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

/** Finds a form control by label, ignoring the visual required marker ("Password *"). */
export function getField(label: string): HTMLElement {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByLabelText(new RegExp(`^${escaped}\\s*\\*?$`));
}

export const testHousehold: Household = {
  id: '01a1216a-b2bb-76cc-aa3b-00e98252d13f',
  name: 'Otthon',
  baseCurrency: 'HUF',
  role: 'owner',
  createdAt: '2026-10-09T16:06:43.129Z',
};

export function householdDetail(
  household: Household = testHousehold,
  members: HouseholdDetail['members'] = [
    {
      userId: testUser.id,
      displayName: testUser.displayName,
      role: household.role,
      joinedAt: household.createdAt,
    },
  ],
): HouseholdDetail {
  return { ...household, members };
}
