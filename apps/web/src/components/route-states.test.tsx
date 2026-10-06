import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ErrorPage } from './route-states';

describe('ErrorPage', () => {
  it('shows a recoverable error and retries the route on "Try again"', async () => {
    let attempts = 0;
    const rootRoute = createRootRoute({ component: Outlet });
    const flakyRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => {
        attempts++;
        if (attempts === 1) throw new Error('Temporary failure');
      },
      component: () => <h1>Loaded</h1>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([flakyRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultErrorComponent: ErrorPage,
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Loaded' })).toBeVisible();
  });
});
