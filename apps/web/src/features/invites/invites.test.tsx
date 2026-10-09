import type { Invite } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  householdDetail,
  testHousehold,
  testUser,
} from '../../../test/utils';
import { stashInviteToken } from './pending-invite';

const token = 'HoWlqTUznr7fpKfwY1Ubw943jF6puHHROeT4L9mGs9M';
const inFiveDays = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

const signedIn = () => mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse()));
const anonymous = () =>
  mock.post('/api/auth/refresh', () =>
    HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
  );

const householdHandlers = (role: 'owner' | 'member' = 'owner') => [
  mock.get('/api/households', () =>
    HttpResponse.json({ households: [{ ...testHousehold, role }] }),
  ),
  mock.get(`/api/households/${testHousehold.id}`, () =>
    HttpResponse.json({ household: householdDetail({ ...testHousehold, role }) }),
  ),
  mock.get('/api/health/live', () => HttpResponse.json({ status: 'ok', uptimeSeconds: 1 })),
  mock.get('/api/health/ready', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
];

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('invite modal (/h/:id/settings/invite)', () => {
  function inviteApi() {
    const invites: Invite[] = [];
    const calls: string[] = [];
    server.use(
      signedIn(),
      ...householdHandlers(),
      mock.get(`/api/households/${testHousehold.id}/invites`, () => HttpResponse.json({ invites })),
      mock.post(`/api/households/${testHousehold.id}/invites`, () => {
        calls.push('create');
        const invite: Invite = {
          id: '01a1216a-b353-7ef9-9360-e310f853b8bc',
          invitedBy: { userId: testUser.id, displayName: testUser.displayName },
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        invites.push(invite);
        return HttpResponse.json({ invite, token }, { status: 201 });
      }),
      mock.delete(`/api/households/${testHousehold.id}/invites/:inviteId`, ({ params }) => {
        calls.push(`revoke ${String(params.inviteId)}`);
        invites.splice(0, invites.length);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return calls;
  }

  it('creates a link with a QR code, copies it, and revokes it', async () => {
    const calls = inviteApi();
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}/settings`);

    await user.click(await screen.findByRole('link', { name: 'Invite' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite to Otthon' });
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}/settings/invite`);
    expect(await within(dialog).findByText('No pending invites.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    const link = `${window.location.origin}/invite#${token}`;
    expect(await within(dialog).findByRole('textbox', { name: 'Invite link' })).toHaveValue(link);
    expect(
      within(dialog).getByRole('img', { name: 'QR code for the invite to Otthon' }),
    ).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe(link);
    expect(within(dialog).getByRole('button', { name: 'Copied' })).toBeVisible();

    await user.click(await within(dialog).findByRole('button', { name: /^Revoke invite by Anna/ }));

    expect(await within(dialog).findByText('No pending invites.')).toBeVisible();
    // The revoked link disappears from the dialog too.
    expect(within(dialog).queryByRole('textbox', { name: 'Invite link' })).not.toBeInTheDocument();
    expect(calls).toEqual(['create', 'revoke 01a1216a-b353-7ef9-9360-e310f853b8bc']);
  });

  it('closes back to the settings page', async () => {
    inviteApi();
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}/settings`);

    await user.click(await screen.findByRole('link', { name: 'Invite' }));
    await screen.findByRole('dialog', { name: 'Invite to Otthon' });
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}/settings`);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends members who open the link back to the settings page', async () => {
    server.use(signedIn(), ...householdHandlers('member'));
    const router = renderRoute(`/h/${testHousehold.id}/settings/invite`);

    expect(await screen.findByRole('heading', { name: 'Household settings' })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}/settings`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('invite landing page (/invite#token)', () => {
  const preview = () =>
    mock.get(`/api/invites/${token}`, () =>
      HttpResponse.json({
        invite: {
          householdName: 'Otthon',
          invitedBy: { displayName: 'Bela' },
          expiresAt: inFiveDays(),
        },
      }),
    );

  it('shows the invite to visitors, keeps the token out of the URL and offers login', async () => {
    server.use(anonymous(), preview());
    const router = renderRoute(`/invite#${token}`);

    expect(await screen.findByRole('heading', { name: 'Join Otthon' })).toBeVisible();
    expect(screen.getByText(/Bela invited you to share expenses in Otthon/)).toBeVisible();
    expect(screen.getByText(/expires in 5 days/)).toBeVisible();

    await waitFor(() => {
      expect(router.state.location.hash).toBe('');
    });
    expect(router.state.location.href).toBe('/invite');
    expect(sessionStorage.getItem('splinance-pending-invite')).toBe(token);
    // Only "/invite" travels through login, never the token.
    expect(screen.getByRole('link', { name: 'Log in to join' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Finvite',
    );
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?redirect=%2Finvite',
    );
  });

  it('joins after login using the stored token and opens the household', async () => {
    stashInviteToken(token);
    let accepted = false;
    server.use(
      signedIn(),
      preview(),
      ...householdHandlers('member'),
      mock.post(`/api/invites/${token}/accept`, () => {
        accepted = true;
        return HttpResponse.json({ household: { ...testHousehold, role: 'member' } });
      }),
    );
    const user = userEvent.setup();
    const router = renderRoute('/invite');

    expect(await screen.findByText('Joining as Anna.', { exact: false })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Join Otthon' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
    });
    expect(accepted).toBe(true);
    expect(sessionStorage.getItem('splinance-pending-invite')).toBeNull();
  });

  it('tells existing members they are already in', async () => {
    server.use(
      signedIn(),
      preview(),
      mock.post(`/api/invites/${token}/accept`, () =>
        HttpResponse.json(apiError('ALREADY_MEMBER'), { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderRoute(`/invite#${token}`);

    await user.click(await screen.findByRole('button', { name: 'Join Otthon' }));

    expect(await screen.findByText("You're already a member of Otthon.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Splinance' })).toHaveAttribute('href', '/');
  });

  it('lets someone else log out first', async () => {
    let loggedOut = false;
    server.use(
      signedIn(),
      preview(),
      mock.post('/api/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/invite#${token}`);

    await user.click(await screen.findByRole('button', { name: 'Not you? Log out' }));

    expect(await screen.findByRole('link', { name: 'Log in to join' })).toBeVisible();
    expect(loggedOut).toBe(true);
  });

  it.each([
    ['INVITE_EXPIRED', 410, 'This invite has expired'],
    ['INVITE_USED', 410, 'This invite was already used'],
    ['INVITE_REVOKED', 410, 'This invite was revoked'],
    ['INVITE_NOT_FOUND', 404, 'This invite link does not work'],
  ])('explains %s', async (code, status, heading) => {
    server.use(
      anonymous(),
      mock.get(`/api/invites/${token}`, () => HttpResponse.json(apiError(code), { status })),
    );
    renderRoute(`/invite#${token}`);

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to Splinance' })).toHaveAttribute('href', '/');
  });

  it('explains an incomplete link without calling the API', async () => {
    server.use(anonymous());
    renderRoute('/invite#short');

    expect(
      await screen.findByRole('heading', { name: 'This invite link is incomplete' }),
    ).toBeVisible();
  });
});
