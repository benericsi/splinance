import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { apiError, authResponse, getField } from '../../../test/utils';

const withProviders = (...ids: string[]) =>
  mock.get('/api/auth/providers', () =>
    HttpResponse.json({ providers: ids.map((id) => ({ id })) }),
  );

const googleButton = () => screen.queryByRole('link', { name: 'Continue with Google' });

beforeEach(() => {
  server.use(
    mock.post('/api/auth/refresh', () =>
      HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
    ),
  );
});

describe('provider buttons', () => {
  it('links to the API start with the destination, above the email form', async () => {
    server.use(withProviders('google'));
    renderRoute('/login?redirect=%2Fh%2F1%3Fmonth%3D2026-11');

    const button = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(button).toHaveAttribute(
      'href',
      '/api/auth/oauth/google/start?redirect=%2Fh%2F1%3Fmonth%3D2026-11',
    );
    expect(screen.getByText('or with email')).toBeVisible();
    expect(screen.getByText('Signed up with Google? Use the button above.')).toBeVisible();
  });

  it('is on the register page too', async () => {
    server.use(withProviders('google'));
    renderRoute('/register');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google/start',
    );
  });

  it.each([
    ['no providers', withProviders()],
    ['an unknown provider', withProviders('unknown-provider')],
    [
      'a failed list',
      mock.get('/api/auth/providers', () => HttpResponse.json(apiError('X'), { status: 500 })),
    ],
  ])('is absent with %s, leaving the password form', async (_label, handler) => {
    server.use(handler);
    renderRoute('/login');
    await screen.findByRole('heading', { name: 'Log in' });
    expect(googleButton()).toBeNull();
    expect(screen.queryByText('or with email')).toBeNull();
    expect(screen.queryByText(/^Signed up with/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
  });
});

describe('coming back from a provider', () => {
  it('shows the error once and takes the code out of the URL', async () => {
    const router = renderRoute('/login?oauth_error=not_allowed&redirect=%2Fh%2F1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-ups are invite-only for now.');
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ redirect: '/h/1' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-ups are invite-only for now.');
  });

  it('ignores unknown error codes', async () => {
    renderRoute('/login?oauth_error=%3Cscript%3E');
    await screen.findByRole('heading', { name: 'Log in' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks for the password to connect, then says it is connected', async () => {
    let sent: unknown;
    server.use(
      withProviders('google'),
      mock.get('/api/auth/oauth/link', () =>
        HttpResponse.json({ provider: 'google', email: 'cecil@example.com' }),
      ),
      mock.post('/api/auth/login', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...authResponse(), linkedProvider: 'google' });
      }),
      mock.get('/api/households', () => HttpResponse.json({ households: [] })),
    );
    const router = renderRoute('/login?oauth=link&redirect=%2Fwelcome');

    expect(await screen.findByRole('status')).toHaveTextContent('Connect your Google account');
    expect(getField('Email')).toHaveValue('cecil@example.com');
    expect(getField('Password')).toHaveFocus();
    expect(googleButton()).toBeNull();

    const user = userEvent.setup();
    await user.type(getField('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Log in and connect' }));

    expect(
      await screen.findByText('Google is now connected. Next time, continue with Google.'),
    ).toBeVisible();
    expect(sent).toEqual({ email: 'cecil@example.com', password: 'correct horse battery' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/welcome');
    });
  });

  it('falls back to the normal login when nothing is waiting anymore', async () => {
    server.use(
      withProviders('google'),
      mock.get('/api/auth/oauth/link', () =>
        HttpResponse.json(apiError('NOT_FOUND'), { status: 404 }),
      ),
    );
    renderRoute('/login?oauth=link');

    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    expect(getField('Email')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
  });
});
