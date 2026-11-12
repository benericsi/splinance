import { daysOfMonth } from '@splinance/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Shared MSW server; tests add handlers with server.use(...), which take precedence over
 * these defaults (and server.resetHandlers() returns to them after each test). Defaults are
 * only for reads that many pages make in passing; everything else must be handled
 * explicitly, or the request fails the test.
 */
export const server = setupServer(
  // /login and /register list the sign-in providers; none unless a test adds them.
  http.get('/api/auth/providers', () => HttpResponse.json({ providers: [] })),
  // The settings page lists the household's categories.
  http.get('/api/households/:id/categories', () => HttpResponse.json({ categories: [] })),
  // Settings and the import page list the household's rules.
  http.get('/api/households/:id/rules', () => HttpResponse.json({ rules: [] })),
  // The overview, where most household tests land, shows balances, budgets, recurring
  // payments and settlements; the import page also reads recurring payments.
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
  // The overview's "Left this month": an empty month (no income, so only its nudge shows).
  http.get('/api/households/:id/calendar', ({ request }) => {
    const month = new URL(request.url).searchParams.get('month') ?? '';
    return HttpResponse.json({
      calendar: {
        month,
        today: `${month}-01`,
        currency: 'HUF',
        days: daysOfMonth(month).map((date) => ({
          date,
          expenses: 0,
          income: 0,
          yourExpenses: 0,
          yourIncome: 0,
          count: 0,
        })),
        events: [],
      },
    });
  }),
  http.get('/api/households/:id/recurring', () =>
    HttpResponse.json({
      recurring: { currency: 'HUF', series: [], suggestions: [], dismissed: [] },
    }),
  ),
  // Every household page shows the bell: no notifications unless a test adds some.
  http.get('/api/notifications/unread-count', () => HttpResponse.json({ unread: 0 })),
  http.get('/api/notifications', () => HttpResponse.json({ notifications: [], unread: 0 })),
  http.get('/api/households/:id/notification-settings', () =>
    HttpResponse.json({ settings: { activity: true } }),
  ),
  http.get('/api/households/:id/settlements', () =>
    HttpResponse.json({ settlements: [], nextCursor: null }),
  ),
);
