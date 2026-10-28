import { screen } from '@testing-library/react';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type * as DemoSite from '@/lib/demo-site';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { apiError } from '../../../test/utils';

// Production with VITE_DEMO_URL set.
vi.mock('@/lib/demo-site', async (importOriginal) => ({
  ...(await importOriginal<typeof DemoSite>()),
  DEMO_URL: 'https://demo.example.com',
}));

describe('the production login page', () => {
  it('links visitors without an account to the demo site', async () => {
    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
      ),
    );
    renderRoute('/login');

    expect(await screen.findByRole('link', { name: 'Try the demo' })).toHaveAttribute(
      'href',
      'https://demo.example.com',
    );
  });
});
