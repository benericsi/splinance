import { DEFAULT_PREFERENCES, type UpdatePreferencesInput } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { HIDE_AMOUNTS_STORAGE_KEY, hideAmountsStore } from '@/lib/hide-amounts';
import { THEME_STORAGE_KEY, themeStore } from '@/lib/theme';
import { setDemoSite } from '../../../test/demo-site';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { apiError, authResponse, testHousehold, testUser } from '../../../test/utils';

function fakeApi({ fail = false }: { fail?: boolean } = {}) {
  const saves: UpdatePreferencesInput[] = [];
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.patch('/api/account/preferences', async ({ request }) => {
      const body = (await request.json()) as UpdatePreferencesInput;
      saves.push(body);
      if (fail)
        return HttpResponse.json(apiError('INTERNAL', 'Something went wrong'), { status: 500 });
      const preferences = { ...authStore.getState().user?.preferences, ...body };
      return HttpResponse.json({ user: { ...testUser, preferences } });
    }),
  );
  return saves;
}

/** The pill group of one setting row, by the row's title. */
function setting(name: string) {
  return within(screen.getByRole('group', { name }));
}

afterEach(() => {
  themeStore.setPreference('system');
  localStorage.removeItem(THEME_STORAGE_KEY);
  hideAmountsStore.setHidden(false);
  localStorage.removeItem(HIDE_AMOUNTS_STORAGE_KEY);
});

describe('preferences page', () => {
  it('shows display settings and the saved defaults, between the account tabs', async () => {
    fakeApi();
    renderRoute('/account/preferences');

    expect(await screen.findByRole('heading', { name: 'Defaults' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Account settings' })).toBeVisible();
    const tabs = within(screen.getByRole('navigation', { name: 'Account settings' }));
    expect(tabs.getByRole('link', { name: 'Preferences' })).toHaveAttribute('aria-current', 'page');
    expect(tabs.getByRole('link', { name: 'Account and security' })).toHaveAttribute(
      'href',
      '/account',
    );

    expect(screen.getByRole('heading', { name: 'Display' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    // Theme and hidden amounts stay on the device.
    expect(screen.getAllByText('This device')).toHaveLength(2);
    expect(setting('Overview opens as').getByRole('button', { name: 'Cards' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      setting('New transactions start as').getByRole('button', { name: 'Shared' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      setting('Reports and calendar show').getByRole('button', { name: 'Household' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves a default at once and keeps the others', async () => {
    const saves = fakeApi();
    renderRoute('/account/preferences');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Map' }));
    expect(setting('Overview opens as').getByRole('button', { name: 'Map' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(
      setting('Reports and calendar show').getByRole('button', { name: 'Your share' }),
    );

    await waitFor(() => {
      expect(authStore.getState().user?.preferences).toEqual({
        ...DEFAULT_PREFERENCES,
        overviewView: 'map',
        spendingView: 'mine',
      });
    });
    expect(saves).toEqual([{ overviewView: 'map' }, { spendingView: 'mine' }]);
  });

  it('puts the choice back when the save fails', async () => {
    const saves = fakeApi({ fail: true });
    renderRoute('/account/preferences');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Just me' }));

    await waitFor(() => {
      expect(saves).toHaveLength(1);
    });
    await waitFor(() => {
      expect(
        setting('New transactions start as').getByRole('button', { name: 'Shared' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(authStore.getState().user?.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps the theme on this device, without asking the API', async () => {
    const saves = fakeApi();
    renderRoute('/account/preferences');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Dark' }));

    expect(themeStore.getState().preference).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(saves).toEqual([]);
  });

  it('hides amounts on this device, without asking the API', async () => {
    const saves = fakeApi();
    renderRoute('/account/preferences');
    const user = userEvent.setup();

    await screen.findByRole('group', { name: 'Amounts' });
    await user.click(setting('Amounts').getByRole('button', { name: 'Hide' }));

    expect(document.documentElement).toHaveClass('hide-amounts');
    expect(localStorage.getItem(HIDE_AMOUNTS_STORAGE_KEY)).toBe('true');
    expect(saves).toEqual([]);

    await user.click(setting('Amounts').getByRole('button', { name: 'Show' }));
    expect(document.documentElement).not.toHaveClass('hide-amounts');
  });

  it('stays open on the demo site, without the account tab', async () => {
    setDemoSite();
    const saves = fakeApi();
    renderRoute('/account/preferences');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Account settings' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Map' }));
    await waitFor(() => {
      expect(saves).toEqual([{ overviewView: 'map' }]);
    });
  });
});

describe('account page', () => {
  it('links to the preferences from its tabs', async () => {
    fakeApi();
    server.use(
      mock.get('/api/account', () =>
        HttpResponse.json({
          user: testUser,
          hasPassword: true,
          identities: [],
          providers: [],
          recentSignIn: true,
        }),
      ),
    );
    renderRoute('/account');

    const tabs = within(await screen.findByRole('navigation', { name: 'Account settings' }));
    expect(tabs.getByRole('link', { name: 'Account and security' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(tabs.getByRole('link', { name: 'Preferences' })).toHaveAttribute(
      'href',
      '/account/preferences',
    );
    // The language moved to the preferences.
    expect(screen.queryByRole('button', { name: 'Magyar' })).not.toBeInTheDocument();
  });
});
