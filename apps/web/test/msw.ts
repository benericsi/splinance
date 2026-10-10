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
);
