import { screen } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/msw';
import { renderRoute as renderAt } from '../../test/router';
import { apiError, authResponse, householdDetail, testHousehold } from '../../test/utils';

const signedIn = [
  mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
  mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
  mock.get('/api/households/:id', () => HttpResponse.json({ household: householdDetail() })),
  mock.get('/api/health/live', () => HttpResponse.json({ status: 'ok', uptimeSeconds: 1 })),
  mock.get('/api/health/ready', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
];

const greeting = /^Good (morning|afternoon|evening), Anna$/;

describe('route guard and session restore', () => {
  it('sends anonymous visitors to /login and keeps where they wanted to go', async () => {
    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
      ),
    );

    const router = renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/' });
  });

  it('restores the session from the refresh cookie on first load', async () => {
    server.use(...signedIn);

    const router = renderAt('/');

    expect(await screen.findByRole('heading', { name: greeting })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
  });

  it('redirects logged-in users away from /login', async () => {
    server.use(...signedIn);

    const router = renderAt('/login');

    expect(await screen.findByRole('heading', { name: greeting })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
  });
});

describe('page titles and not found', () => {
  it('sets a page title per route', async () => {
    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
      ),
    );

    renderAt('/login');

    await screen.findByRole('heading', { name: 'Log in' });
    expect(document.title).toBe('Log in · Splinance');
  });

  it('shows a full 404 page for unknown URLs', async () => {
    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
      ),
    );

    renderAt('/does/not/exist');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Page not found · Splinance');
  });
});
