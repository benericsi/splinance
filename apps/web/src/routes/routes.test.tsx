import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { server } from '../../test/msw';
import { renderRoute as renderAt } from '../../test/router';
import { apiError, authResponse, getField, householdDetail, testHousehold } from '../../test/utils';

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

describe('where login leads after the session ended', () => {
  const nora = {
    id: '01a1216a-b248-781c-9cc6-cd68276fcdfc',
    email: 'nora@example.com',
    displayName: 'Nora',
    createdAt: '2026-10-09T16:06:43.492Z',
  };
  const norasHome = {
    ...testHousehold,
    id: '01a1216a-b2bb-76cc-aa3b-00e98252d199',
    name: 'Nora home',
  };

  it('forgets the previous page after an explicit logout, so the next person starts fresh', async () => {
    server.use(
      ...signedIn,
      mock.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    const router = renderAt(`/h/${testHousehold.id}/settings`);

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({});

    // Nora logs in on the same browser and lands in her own household, not Anna's.
    server.use(
      mock.post('/api/auth/login', () => HttpResponse.json(authResponse('access-2', nora))),
      mock.get('/api/households', () => HttpResponse.json({ households: [norasHome] })),
      mock.get(`/api/households/${norasHome.id}`, () =>
        HttpResponse.json({ household: householdDetail(norasHome) }),
      ),
    );
    await user.type(getField('Email'), nora.email);
    await user.type(getField('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${norasHome.id}`);
    });
  });

  it('keeps the page when the session expired, so the same person continues there', async () => {
    server.use(...signedIn);
    const router = renderAt(`/h/${testHousehold.id}/settings`);
    await screen.findByRole('heading', { name: 'Household settings' });

    act(() => {
      authStore.clear();
    });

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(router.state.location.search).toEqual({
      redirect: `/h/${testHousehold.id}/settings`,
    });
  });
});
