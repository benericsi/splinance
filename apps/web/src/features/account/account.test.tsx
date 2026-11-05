import type { AccountDeletionPreview, AccountResponse } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { setDemoSite } from '../../../test/demo-site';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { apiError, authResponse, getField, testHousehold, testUser } from '../../../test/utils';
import { formatLastUsed } from './format';

const passwordAccount: AccountResponse = {
  user: testUser,
  hasPassword: true,
  identities: [],
  providers: [{ id: 'google' }],
  recentSignIn: true,
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
  recentSignIn: true,
};

const bothConnected: AccountResponse = { ...googleOnly, hasPassword: true };

const cleanPreview: AccountDeletionPreview = {
  blockers: [],
  leaves: [{ householdId: testHousehold.id, householdName: 'Otthon' }],
  deletes: [],
  archives: [],
  privateTransactionCount: 3,
};

const GOOGLE_AUTHORIZE = 'https://accounts.example/authorize?state=s';

function fakeApi(account: AccountResponse = passwordAccount) {
  const state = {
    patches: [] as unknown[],
    passwords: [] as unknown[],
    revokes: 0,
    connects: [] as unknown[],
    reauths: [] as unknown[],
    disconnects: [] as unknown[],
    deletes: [] as unknown[],
  };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/account', () => HttpResponse.json(account)),
    // The Back link names the household used last.
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get('/api/account/deletion', () => HttpResponse.json(cleanPreview)),
    mock.post('/api/account/delete', async ({ request }) => {
      state.deletes.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
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
    mock.post('/api/account/identities/google/connect', async ({ request }) => {
      state.connects.push(await request.json());
      return HttpResponse.json({ authorizationUrl: GOOGLE_AUTHORIZE });
    }),
    mock.post('/api/account/identities/google/reauth', async ({ request }) => {
      state.reauths.push(await request.json());
      return HttpResponse.json({ authorizationUrl: GOOGLE_AUTHORIZE });
    }),
    mock.post('/api/account/identities/google/disconnect', async ({ request }) => {
      state.disconnects.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

/** window.location.assign, which leaves for the provider. */
function spyOnNavigation() {
  const assign = vi.fn();
  const { href, origin } = window.location;
  vi.stubGlobal('location', { href, origin, assign });
  return assign;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('shows when Google was connected and why it cannot be disconnected', async () => {
    fakeApi(googleOnly);
    renderRoute('/account');

    await screen.findByRole('heading', { name: 'Sign-in methods' });
    const methods = within(signInMethods());
    expect(methods.getByText('Not set')).toBeVisible();
    expect(methods.getByRole('link', { name: 'Set a password' })).toHaveAttribute(
      'href',
      '/account/password',
    );
    expect(methods.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(
      methods.getByText(
        'Your only way to sign in. Set a password first, then you can disconnect Google.',
      ),
    ).toBeVisible();
    expect(methods.getByText(/^Connected 4 Nov 2026 · Last used /)).toBeVisible();
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

  it('leads back to the household used last, by name', async () => {
    fakeApi();
    renderRoute('/account');
    expect(await screen.findByRole('link', { name: 'Back to Otthon' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}`,
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

  it('sets a first password right after signing in with Google', async () => {
    const state = fakeApi(googleOnly);
    const router = renderRoute('/account/password');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Set a password' });
    expect(within(dialog).queryByLabelText(/^Current password/)).toBeNull();
    await user.type(within(dialog).getByLabelText(/^New password/), 'violet tram morning');
    await user.click(within(dialog).getByRole('button', { name: 'Set password' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/account');
    });
    expect(state.passwords).toEqual([{ newPassword: 'violet tram morning' }]);
  });

  it('asks to confirm with Google first when the sign-in is not recent', async () => {
    const state = fakeApi({ ...googleOnly, recentSignIn: false });
    const assign = spyOnNavigation();
    renderRoute('/account/password');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Set a password' });
    expect(within(dialog).queryByLabelText(/^New password/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(GOOGLE_AUTHORIZE);
    });
    expect(state.reauths).toEqual([{ redirect: '/account/password' }]);
  });

  it('switches to the confirmation when the API says the sign-in got too old', async () => {
    fakeApi(googleOnly);
    server.use(
      mock.post('/api/account/password', () =>
        HttpResponse.json(apiError('REAUTH_REQUIRED'), { status: 403 }),
      ),
    );
    renderRoute('/account/password');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Set a password' });
    await user.type(within(dialog).getByLabelText(/^New password/), 'violet tram morning');
    await user.click(within(dialog).getByRole('button', { name: 'Set password' }));
    expect(
      await within(dialog).findByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible();
  });
});

describe('providers', () => {
  it('connects Google after the password and leaves for Google', async () => {
    const state = fakeApi();
    const assign = spyOnNavigation();
    renderRoute('/account');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Sign-in methods' });
    await user.click(within(signInMethods()).getByRole('button', { name: 'Connect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Connect Google?' });
    await user.type(within(dialog).getByLabelText('Current password'), 'correct horse battery');
    await user.click(within(dialog).getByRole('button', { name: 'Continue to Google' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(GOOGLE_AUTHORIZE);
    });
    expect(state.connects).toEqual([{ currentPassword: 'correct horse battery' }]);
  });

  it('shows a wrong password next to the field', async () => {
    fakeApi();
    server.use(
      mock.post('/api/account/identities/google/connect', () =>
        HttpResponse.json(apiError('WRONG_PASSWORD', 'That is not your current password'), {
          status: 400,
        }),
      ),
    );
    renderRoute('/account');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Sign-in methods' });
    await user.click(within(signInMethods()).getByRole('button', { name: 'Connect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Connect Google?' });
    await user.type(within(dialog).getByLabelText('Current password'), 'not it');
    await user.click(within(dialog).getByRole('button', { name: 'Continue to Google' }));
    expect(await within(dialog).findByText('That is not your current password')).toBeVisible();
    expect(within(dialog).getByLabelText('Current password')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('disconnects Google when a password is left', async () => {
    const state = fakeApi(bothConnected);
    renderRoute('/account');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Sign-in methods' });
    await user.click(within(signInMethods()).getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disconnect Google?' });
    await user.type(within(dialog).getByLabelText('Current password'), 'correct horse battery');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(
      await screen.findByText('Google is disconnected. Other devices are signed out.'),
    ).toBeVisible();
    expect(state.disconnects).toEqual([{ currentPassword: 'correct horse battery' }]);
  });

  it('says once that Google is connected, then cleans the URL', async () => {
    fakeApi(bothConnected);
    const router = renderRoute('/account?connected=google');
    expect(
      await screen.findByText('Google is now connected. Next time, you can continue with Google.'),
    ).toBeVisible();
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it('explains a failed connect', async () => {
    fakeApi();
    const router = renderRoute('/account?oauth_error=taken');
    expect(
      await screen.findByText('That Google account is already used by another Splinance account.'),
    ).toBeVisible();
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });
});

describe('last used', () => {
  it('says today, yesterday or the date', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00'));
    try {
      expect(formatLastUsed('2026-11-04T08:00:00')).toBe('today');
      expect(formatLastUsed('2026-11-03T23:00:00')).toBe('yesterday');
      expect(formatLastUsed('2026-10-20T12:00:00')).toBe('20 Oct 2026');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('delete account dialog', () => {
  it('says what happens, then deletes with the password and the email', async () => {
    const state = fakeApi();
    const router = renderRoute('/account/delete');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(
      within(dialog).getByText(/Your shared entries stay there as Former member/),
    ).toBeVisible();
    expect(within(dialog).getByText('3 private transactions are deleted.')).toBeVisible();

    await user.type(within(dialog).getByLabelText(/^Current password/), 'correct horse battery');
    await user.type(within(dialog).getByLabelText(/^Type anna@example.com/), 'anna@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(state.deletes).toEqual([
      { currentPassword: 'correct horse battery', confirmEmail: 'anna@example.com' },
    ]);
    expect(authStore.getState().endedBy).toBe('deleted');
    expect(await screen.findByText(/Your account has been deleted/)).toBeVisible();
    // No way back to the deleted account's pages.
    expect(router.state.location.search).toEqual({});
  });

  it('refuses another email before sending', async () => {
    const state = fakeApi();
    renderRoute('/account/delete');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    await user.type(within(dialog).getByLabelText(/^Current password/), 'correct horse battery');
    await user.type(within(dialog).getByLabelText(/^Type anna@example.com/), 'ana@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog).findByText('Type your email exactly as shown')).toBeVisible();
    expect(state.deletes).toEqual([]);
  });

  it('shows only the blockers, with the way to resolve them', async () => {
    fakeApi();
    server.use(
      mock.get('/api/account/deletion', () =>
        HttpResponse.json({
          ...cleanPreview,
          blockers: [
            { householdId: testHousehold.id, householdName: 'Otthon', code: 'UNSETTLED_BALANCE' },
          ],
        }),
      ),
    );
    renderRoute('/account/delete');

    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(within(dialog).getByRole('link', { name: 'Settle up' })).toHaveAttribute(
      'href',
      `/h/${testHousehold.id}`,
    );
    expect(within(dialog).queryByRole('button', { name: 'Delete my account' })).toBeNull();
  });

  it('asks a Google-only account to confirm with Google when the sign-in is old', async () => {
    fakeApi({ ...googleOnly, recentSignIn: false });
    renderRoute('/account/delete');
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(within(dialog).getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(within(dialog).queryByLabelText(/^Type anna@example.com/)).toBeNull();
  });
});
