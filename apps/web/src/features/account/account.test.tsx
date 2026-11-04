import type { AccountResponse } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { setDemoSite } from '../../../test/demo-site';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { apiError, authResponse, getField, testUser } from '../../../test/utils';
import { formatLastUsed } from './format';

const passwordAccount: AccountResponse = {
  user: testUser,
  hasPassword: true,
  identities: [],
  providers: [{ id: 'google' }],
};

const googleOnly: AccountResponse = {
  user: testUser,
  hasPassword: false,
  identities: [
    {
      provider: 'google',
      connectedAt: '2026-11-04T10:00:00.000Z',
      lastUsedAt: '2026-11-04T10:00:00.000Z',
    },
  ],
  providers: [{ id: 'google' }],
};

function fakeApi(account: AccountResponse = passwordAccount) {
  const state = { patches: [] as unknown[], passwords: [] as unknown[], revokes: 0 };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/account', () => HttpResponse.json(account)),
    mock.patch('/api/account', async ({ request }) => {
      const body = (await request.json()) as { displayName: string };
      state.patches.push(body);
      return HttpResponse.json({ user: { ...testUser, displayName: body.displayName } });
    }),
    mock.post('/api/account/password', async ({ request }) => {
      state.passwords.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
    mock.post('/api/account/sessions/revoke-others', () => {
      state.revokes++;
      return HttpResponse.json({ revoked: 2 });
    }),
  );
  return state;
}

function signInMethods(): HTMLElement {
  const card = screen
    .getByRole('heading', { name: 'Sign-in methods' })
    .closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) throw new Error('no sign-in methods card');
  return card;
}

describe('account page', () => {
  it('shows the profile and a password account’s sign-in methods', async () => {
    fakeApi();
    renderRoute('/account');

    expect(await screen.findByRole('heading', { name: 'Sign-in methods' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Account settings' })).toBeVisible();
    expect(screen.getByText('anna@example.com')).toBeVisible();
    expect(
      screen.getByText("Your email is used to sign in. It can't be changed yet."),
    ).toBeVisible();
    const methods = within(signInMethods());
    expect(methods.getByText('Set')).toBeVisible();
    expect(methods.getByRole('link', { name: 'Change' })).toHaveAttribute(
      'href',
      '/account/password',
    );
    expect(methods.getByText('Not connected')).toBeVisible();
  });

  it('shows when Google was connected and last used, and no password to change', async () => {
    fakeApi(googleOnly);
    renderRoute('/account');

    await screen.findByRole('heading', { name: 'Sign-in methods' });
    const methods = within(signInMethods());
    expect(methods.getByText('Not set')).toBeVisible();
    expect(methods.queryByRole('link', { name: 'Change' })).toBeNull();
    expect(methods.getByText(/^Connected Nov 4, 2026 · Last used /)).toBeVisible();
  });

  it('renames inline and updates the signed-in user', async () => {
    const state = fakeApi();
    renderRoute('/account');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Edit name' }));
    const field = getField('Display name');
    await user.clear(field);
    await user.type(field, 'Anna K.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(state.patches).toEqual([{ displayName: 'Anna K.' }]);
    });
    expect(authStore.getState().user?.displayName).toBe('Anna K.');
  });

  it('signs out the other devices', async () => {
    const state = fakeApi();
    renderRoute('/account');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign out other devices' }));
    expect(await screen.findByText('Signed out of 2 other devices')).toBeVisible();
    expect(state.revokes).toBe(1);
  });

  it('points to the privacy contact for deletion', async () => {
    fakeApi();
    renderRoute('/account');
    expect(await screen.findByRole('link', { name: 'bene.richard24@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:bene.richard24@gmail.com',
    );
  });

  it('does not exist on the demo site', async () => {
    setDemoSite();
    server.use(
      mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      mock.get('/api/households', () => HttpResponse.json({ households: [] })),
    );
    const router = renderRoute('/account');
    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe('/account');
    });
  });
});

describe('change password dialog', () => {
  it('changes the password with the current one and closes', async () => {
    const state = fakeApi();
    const router = renderRoute('/account/password');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Change password' });
    await user.type(within(dialog).getByLabelText(/^Current password/), 'correct horse battery');
    await user.type(within(dialog).getByLabelText(/^New password/), 'violet tram morning');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/account');
    });
    expect(state.passwords).toEqual([
      { currentPassword: 'correct horse battery', newPassword: 'violet tram morning' },
    ]);
    expect(
      await screen.findByText('Password changed. Other devices are signed out.'),
    ).toBeVisible();
  });

  it('shows a wrong current password next to its field', async () => {
    fakeApi();
    server.use(
      mock.post('/api/account/password', () =>
        HttpResponse.json(apiError('WRONG_PASSWORD', 'That is not your current password'), {
          status: 400,
        }),
      ),
    );
    renderRoute('/account/password');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Change password' });
    const current = within(dialog).getByLabelText(/^Current password/);
    await user.type(current, 'not it');
    await user.type(within(dialog).getByLabelText(/^New password/), 'violet tram morning');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));

    expect(await within(dialog).findByText('That is not your current password')).toBeVisible();
    expect(current).toHaveAttribute('aria-invalid', 'true');
  });

  it('checks the rules with the user’s own name before sending', async () => {
    const state = fakeApi();
    renderRoute('/account/password');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Change password' });
    await user.type(within(dialog).getByLabelText(/^Current password/), 'correct horse battery');
    await user.type(within(dialog).getByLabelText(/^New password/), 'anna loves trams');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText(/^New password/)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(state.passwords).toEqual([]);
  });

  it('sends an account without a password back to the page', async () => {
    fakeApi(googleOnly);
    const router = renderRoute('/account/password');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/account');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('last used', () => {
  it('says today, yesterday or the date', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00'));
    try {
      expect(formatLastUsed('2026-11-04T08:00:00')).toBe('today');
      expect(formatLastUsed('2026-11-03T23:00:00')).toBe('yesterday');
      expect(formatLastUsed('2026-10-20T12:00:00')).toBe('Oct 20, 2026');
    } finally {
      vi.useRealTimers();
    }
  });
});
