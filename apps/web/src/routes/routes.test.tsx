import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { routeTree } from '@/routeTree.gen';
import { server } from '../../test/msw';
import { apiError, authResponse } from '../../test/utils';

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient, auth: authStore },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const health = [
  mock.get('/api/health/live', () => HttpResponse.json({ status: 'ok', uptimeSeconds: 1 })),
  mock.get('/api/health/ready', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
];

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
    server.use(
      mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      ...health,
    );

    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Anna' })).toBeVisible();
  });

  it('redirects logged-in users away from /login', async () => {
    server.use(
      mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
      ...health,
    );

    const router = renderAt('/login');

    expect(await screen.findByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
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
