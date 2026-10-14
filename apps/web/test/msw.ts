import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Shared MSW server; tests add handlers with server.use(...), which take precedence over
 * these defaults (and server.resetHandlers() returns to them after each test). Defaults are
 * only for reads that many pages make in passing; everything else must be handled
 * explicitly, or the request fails the test.
 */
export const server = setupServer(
  // The settings page lists the household's categories.
  http.get('/api/households/:id/categories', () => HttpResponse.json({ categories: [] })),
  // Settings and the import page list the household's rules.
  http.get('/api/households/:id/rules', () => HttpResponse.json({ rules: [] })),
  // The overview, where most household tests land, shows balances, budgets and settlements.
  http.get('/api/households/:id/balances', () =>
    HttpResponse.json({ balances: { currency: 'HUF', debts: [] } }),
  ),
  http.get('/api/households/:id/budgets', ({ request }) =>
    HttpResponse.json({
      budgets: {
        month: new URL(request.url).searchParams.get('month') ?? '',
        currency: 'HUF',
        budgets: [],
      },
    }),
  ),
  http.get('/api/households/:id/settlements', () =>
    HttpResponse.json({ settlements: [], nextCursor: null }),
  ),
);
