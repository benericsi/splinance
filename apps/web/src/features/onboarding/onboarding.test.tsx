import type { Household, Invite } from '@splinance/shared';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  getField,
  householdDetail,
  testHousehold,
  testUser,
} from '../../../test/utils';
import { tokenFromInviteLink } from './join-link';

const token = 'HoWlqTUznr7fpKfwY1Ubw943jF6puHHROeT4L9mGs9M';

/** A new user without households; creating one and inviting work like the real API. */
function newUserApi() {
  const households: Household[] = [];
  const invites: Invite[] = [];
  let createdWith: unknown;
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/health/live', () => HttpResponse.json({ status: 'ok', uptimeSeconds: 1 })),
    mock.get('/api/health/ready', () =>
      HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
    ),
    mock.get('/api/households', () => HttpResponse.json({ households })),
    mock.post('/api/households', async ({ request }) => {
      createdWith = await request.json();
      households.push(testHousehold);
      return HttpResponse.json({ household: testHousehold }, { status: 201 });
    }),
    mock.get('/api/households/:id', ({ params }) =>
      households.some((h) => h.id === params.id)
        ? HttpResponse.json({ household: householdDetail() })
        : HttpResponse.json(apiError('HOUSEHOLD_NOT_FOUND'), { status: 404 }),
    ),
    mock.get(`/api/households/${testHousehold.id}/invites`, () => HttpResponse.json({ invites })),
    mock.post(`/api/households/${testHousehold.id}/invites`, () => {
      const invite: Invite = {
        id: '01a1216a-b353-7ef9-9360-e310f853b8bc',
        invitedBy: { userId: testUser.id, displayName: testUser.displayName },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      invites.push(invite);
      return HttpResponse.json({ invite, token }, { status: 201 });
    }),
  );
  return { createdWith: () => createdWith };
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('onboarding: create a household', () => {
  it('walks from welcome to the new household, inviting on the way', async () => {
    const api = newUserApi();
    const user = userEvent.setup();
    const router = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
    expect(screen.getByText('Step 1 of 4')).toBeVisible();
    await user.click(screen.getByRole('link', { name: /Create a household/ }));

    expect(await screen.findByRole('heading', { name: 'Name your household' })).toBeVisible();
    expect(getField('Name')).toHaveFocus();
    await user.type(getField('Name'), ' Otthon ');
    await user.click(screen.getByRole('button', { name: 'Create household' }));

    expect(await screen.findByRole('heading', { name: 'Invite your partner' })).toBeVisible();
    expect(api.createdWith()).toEqual({ name: 'Otthon' });
    expect(router.state.location.pathname).toBe('/welcome/invite');
    expect(router.state.location.search).toEqual({ household: testHousehold.id });

    await user.click(screen.getByRole('button', { name: 'Create invite link' }));
    expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${window.location.origin}/invite#${token}`,
    );
    await user.click(screen.getByRole('link', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Otthon is ready' })).toBeVisible();
    expect(await screen.findByText('Invite sent, waiting for them to join')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Go to Otthon' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
    });
  });

  it('can skip the invite', async () => {
    newUserApi();
    const user = userEvent.setup();
    renderRoute('/welcome/household');

    await user.type(await screen.findByLabelText(/^Name/), 'Otthon');
    await user.click(screen.getByRole('button', { name: 'Create household' }));
    await user.click(await screen.findByRole('link', { name: 'Skip for now' }));

    expect(await screen.findByText('Invite someone anytime from settings')).toBeVisible();
  });

  it('does not offer the name step again after creating (back goes to welcome)', async () => {
    newUserApi();
    const user = userEvent.setup();
    const router = renderRoute('/welcome');

    await user.click(await screen.findByRole('link', { name: /Create a household/ }));
    await user.type(await screen.findByLabelText(/^Name/), 'Otthon');
    await user.click(screen.getByRole('button', { name: 'Create household' }));
    await screen.findByRole('heading', { name: 'Invite your partner' });

    router.history.back();

    expect(await screen.findByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
  });

  it('restarts when a later step has no household', async () => {
    newUserApi();
    const router = renderRoute('/welcome/invite');

    expect(await screen.findByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/welcome');
  });
});

describe('onboarding: join with a link', () => {
  it('takes a pasted link to the invite page, keeping the token out of the URL', async () => {
    newUserApi();
    server.use(
      mock.get(`/api/invites/${token}`, () =>
        HttpResponse.json({
          invite: {
            householdName: 'Balaton trip',
            invitedBy: { displayName: 'Bela' },
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
        }),
      ),
    );
    const user = userEvent.setup();
    const router = renderRoute('/welcome');

    await user.click(await screen.findByRole('link', { name: /Join with an invite link/ }));
    expect(await screen.findByText('Step 2 of 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Paste the invite link you received')).toBeVisible();

    await user.type(getField('Invite link'), 'https://example.com/nope');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText("That doesn't look like an invite link")).toBeVisible();

    await user.clear(getField('Invite link'));
    await user.type(getField('Invite link'), `https://splinance.hu/invite#${token}`);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Join Balaton trip' })).toBeVisible();
    expect(router.state.location.href).toBe('/invite');
    expect(sessionStorage.getItem('splinance-pending-invite')).toBe(token);
  });
});

describe('tokenFromInviteLink', () => {
  it('accepts the whole link or the bare token', () => {
    expect(tokenFromInviteLink(` https://splinance.hu/invite#${token} `)).toBe(token);
    expect(tokenFromInviteLink(token)).toBe(token);
  });
});
