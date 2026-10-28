import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth-store';
import { pageLoad } from '@/lib/demo-site';
import { setDemoSite } from '../../../test/demo-site';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  householdDetail,
  testHousehold,
  testUser,
} from '../../../test/utils';
import { deletedWhen } from './expiry';

const DAY_MS = 86_400_000;
const greeting = /^Good (morning|afternoon|evening), Anna$/;
const base = `/api/households/${testHousehold.id}`;
const inSixDays = () => new Date(Date.now() + 6 * DAY_MS - 60_000).toISOString();

/** The API of the demo instance; `signedIn` restores a session from the refresh cookie. */
function demoApi({ signedIn }: { signedIn: boolean }) {
  const calls: string[] = [];
  server.use(
    mock.post('/api/auth/refresh', () =>
      signedIn
        ? HttpResponse.json(authResponse())
        : HttpResponse.json(apiError('INVALID_REFRESH_TOKEN'), { status: 401 }),
    ),
    mock.post('/api/demo', () => {
      calls.push('POST');
      return HttpResponse.json(
        { ...authResponse(), householdId: testHousehold.id, expiresAt: inSixDays() },
        { status: 201 },
      );
    }),
    mock.get('/api/demo', () => HttpResponse.json({ demo: { expiresAt: inSixDays() } })),
    mock.delete('/api/demo', () => {
      calls.push('DELETE');
      return new HttpResponse(null, { status: 204 });
    }),
    mock.get('/api/households', () => HttpResponse.json({ households: [testHousehold] })),
    mock.get('/api/households/:id', () => HttpResponse.json({ household: householdDetail() })),
  );
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('deletedWhen', () => {
  it('says when a sandbox is deleted, in days', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(deletedWhen('2026-11-04T12:00:00Z', now)).toBe('in 7 days');
    expect(deletedWhen('2026-10-29T11:00:00Z', now)).toBe('tomorrow');
    expect(deletedWhen('2026-10-28T13:00:00Z', now)).toBe('tomorrow');
    expect(deletedWhen('2026-10-28T11:00:00Z', now)).toBe('today');
  });
});

describe('the demo site', () => {
  it('starts a demo from the landing page and opens the seeded household', async () => {
    setDemoSite();
    const calls = demoApi({ signedIn: false });
    const user = userEvent.setup();
    const router = renderRoute('/');

    expect(
      await screen.findByRole('heading', { name: 'Shared expenses, sorted.', level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /Source code on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/benericsi/splinance',
    );

    await user.click(screen.getByRole('button', { name: 'Try the demo' }));

    expect(await screen.findByRole('heading', { name: greeting })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
    expect(calls).toEqual(['POST']);
    expect(authStore.getState().user?.id).toBe(testUser.id);
    const banner = screen.getByRole('complementary', { name: 'Demo' });
    await waitFor(() => {
      expect(banner).toHaveTextContent('Demo data · deleted in 6 days');
    });
  });

  it('has no login or registration: those pages lead to the landing page', async () => {
    setDemoSite();
    demoApi({ signedIn: false });
    const router = renderRoute('/register');

    await screen.findByRole('button', { name: 'Try the demo' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends signed-out visitors of a household page to the landing page', async () => {
    setDemoSite();
    demoApi({ signedIn: false });
    const router = renderRoute(`/h/${testHousehold.id}`);

    await screen.findByRole('button', { name: 'Try the demo' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('starts over with a fresh household after confirming', async () => {
    setDemoSite();
    const calls = demoApi({ signedIn: true });
    const replace = vi.spyOn(pageLoad, 'replace').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}`);

    const banner = await screen.findByRole('complementary', { name: 'Demo' });
    await user.click(within(banner).getByRole('button', { name: 'Start over' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Start over?' });
    await user.click(within(dialog).getByRole('button', { name: 'Start over' }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`/h/${testHousehold.id}`);
    });
    expect(calls).toEqual(['DELETE', 'POST']);
  });

  it('ends the demo from the account menu and goes back to the landing page', async () => {
    setDemoSite();
    const calls = demoApi({ signedIn: true });
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}`);

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    expect(await screen.findByText('Demo account')).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'End demo' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'End the demo?' });
    await user.click(within(dialog).getByRole('button', { name: 'End demo' }));

    expect(await screen.findByRole('button', { name: 'Try the demo' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    expect(calls).toEqual(['DELETE']);
    expect(authStore.getState().status).toBe('anonymous');
  });

  it('offers a sample export on the import page and reads it like a picked file', async () => {
    setDemoSite();
    demoApi({ signedIn: true });
    let checked = 0;
    server.use(
      mock.get(`${base}/imports`, () => HttpResponse.json({ batches: [] })),
      mock.post(`${base}/imports/check`, async ({ request }) => {
        const body = (await request.json()) as { rows: { fingerprint: string }[] };
        checked = body.rows.length;
        return HttpResponse.json({
          rows: body.rows.map((row) => ({
            fingerprint: row.fingerprint,
            status: 'new',
            match: null,
          })),
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}/transactions/import`);

    await user.click(
      await screen.findByRole('button', { name: 'No export at hand? Try a sample one' }),
    );

    expect(await screen.findByRole('heading', { name: /Ready to import/ })).toBeVisible();
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the production site', () => {
  it('shows no demo banner and keeps Log out', async () => {
    demoApi({ signedIn: true });
    const user = userEvent.setup();
    renderRoute(`/h/${testHousehold.id}`);

    await screen.findByRole('heading', { name: greeting });
    expect(screen.queryByRole('complementary', { name: 'Demo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Log out' })).toBeVisible();
    expect(screen.getByText(testUser.email)).toBeVisible();
  });
});
