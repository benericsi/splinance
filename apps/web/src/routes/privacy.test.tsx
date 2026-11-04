import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDemoSite } from '../../test/demo-site';
import { server } from '../../test/msw';
import { renderRoute } from '../../test/router';
import { apiError, authResponse } from '../../test/utils';

const anonymous = mock.post('/api/auth/refresh', () =>
  HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
);

describe('/privacy', () => {
  beforeEach(() => {
    server.use(anonymous);
  });

  it('shows the notice to anonymous visitors, with the controller and the data table', async () => {
    renderRoute('/privacy');

    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
    expect(document.title).toBe('Privacy · Splinance');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'bene.richard24@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:bene.richard24@gmail.com',
    );

    const table = screen.getByRole('table', { name: /legal basis and retention/ });
    // A header row plus one row per kind of data.
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByText(/Backups: the database without sessions/)).toBeVisible();
    expect(screen.getByRole('heading', { name: '3. Signing in with Google' })).toBeVisible();
  });

  it('is linked from the login page', async () => {
    const router = renderRoute('/login');
    const link = await screen.findByRole('link', { name: 'Privacy' });
    await userEvent.setup().click(link);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/privacy');
    });
  });

  it('leads signed-in people back to the app', async () => {
    server.use(
      mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      mock.get('/api/households', () => HttpResponse.json({ households: [] })),
    );
    renderRoute('/privacy');
    expect(await screen.findByRole('link', { name: 'Back to Splinance' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('does not exist on the demo site', async () => {
    setDemoSite();
    const router = renderRoute('/privacy');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});
