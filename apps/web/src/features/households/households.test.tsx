import type { Household } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  apiError,
  authResponse,
  getField,
  householdDetail,
  testHousehold,
  testUser,
} from '../../../test/utils';
import { rememberLastHousehold } from './last-household';

const trip: Household = {
  ...testHousehold,
  id: '01a1216a-b2bb-76cc-aa3b-00e98252d140',
  name: 'Balaton trip',
  role: 'member',
};

/** Logged in as Anna, who belongs to `households`. */
function signedIn(households: Household[] = [testHousehold, trip]) {
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households })),
    mock.get('/api/households/:id', ({ params }) => {
      const household = households.find((h) => h.id === params.id);
      return household
        ? HttpResponse.json({ household: householdDetail(household) })
        : HttpResponse.json(apiError('HOUSEHOLD_NOT_FOUND'), { status: 404 });
    }),
    mock.get('/api/health/live', () => HttpResponse.json({ status: 'ok', uptimeSeconds: 1 })),
    mock.get('/api/health/ready', () =>
      HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
    ),
  );
}

const greeting = /^Good (morning|afternoon|evening), Anna$/;

/** The desktop sidebar (jsdom does not apply CSS, so the phone bar is rendered too). */
const sidebar = () => screen.findByRole('complementary');

afterEach(() => {
  localStorage.clear();
});

describe('opening the app', () => {
  it('goes to the first household by default', async () => {
    signedIn();
    const router = renderRoute('/');

    expect(await screen.findByRole('heading', { name: greeting })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
    expect(document.title).toBe('Otthon · Splinance');
  });

  it('reopens the household used last', async () => {
    signedIn();
    rememberLastHousehold(testUser.id, trip.id);
    const router = renderRoute('/');

    await screen.findByRole('heading', { name: greeting });
    expect(router.state.location.pathname).toBe(`/h/${trip.id}`);
  });

  it('ignores a remembered household the user is no longer in', async () => {
    signedIn([testHousehold]);
    rememberLastHousehold(testUser.id, trip.id);
    const router = renderRoute('/');

    await screen.findByRole('heading', { name: greeting });
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}`);
  });

  it('starts onboarding when the user has no household', async () => {
    signedIn([]);
    const router = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Anna' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/welcome');
  });

  it('shows not found for households the user cannot see', async () => {
    signedIn();
    renderRoute('/h/01a1216a-b2bb-76cc-aa3b-000000000000');

    expect(await screen.findByRole('heading', { name: 'Household not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});

describe('household switcher', () => {
  it('lists the households and switches between them', async () => {
    signedIn();
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}`);

    await user.click(
      await within(await sidebar()).findByRole('button', { name: /Otthon, switch household/ }),
    );
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Otthon/ })).toBeVisible();

    await user.click(within(menu).getByRole('menuitem', { name: /Balaton trip/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${trip.id}`);
    });
    expect(
      await within(await sidebar()).findByRole('button', {
        name: /Balaton trip, switch household/,
      }),
    ).toBeVisible();
  });

  it('links the sections of the current household', async () => {
    signedIn();
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}`);

    const nav = await within(await sidebar()).findByRole('navigation', {
      name: 'Household sections',
    });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(within(nav).getByRole('link', { name: 'Settings' }));

    expect(await screen.findByRole('heading', { name: 'Household settings' })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}/settings`);
    expect(screen.getByText('(you)')).toBeVisible();
    expect(screen.getByText('Owner')).toBeVisible();
  });
});

describe('new household modal (?modal=new-household)', () => {
  it('opens from the switcher, validates, creates and opens the new household', async () => {
    const created: Household = {
      ...testHousehold,
      id: '01a1216a-b2bb-76cc-aa3b-00e98252d141',
      name: 'Flat',
    };
    const households = [testHousehold, trip];
    signedIn(households);
    let body: unknown;
    server.use(
      mock.post('/api/households', async ({ request }) => {
        body = await request.json();
        households.push(created);
        return HttpResponse.json({ household: created }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}`);

    await user.click(
      await within(await sidebar()).findByRole('button', { name: /Otthon, switch household/ }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'New household' }));

    const dialog = await screen.findByRole('dialog', { name: 'New household' });
    expect(router.state.location.search).toEqual({ modal: 'new-household' });
    // The closing menu must not pull focus back to its trigger behind the modal.
    await waitFor(() => {
      expect(getField('Name')).toHaveFocus();
    });

    await user.click(within(dialog).getByRole('button', { name: 'Create household' }));
    expect(await within(dialog).findByText('Name is required')).toBeVisible();

    await user.type(getField('Name'), '  Flat ');
    await user.click(within(dialog).getByRole('button', { name: 'Create household' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${created.id}`);
    });
    expect(body).toEqual({ name: 'Flat' });
    expect(router.state.location.search).toEqual({});
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens from a pasted link and closes to the page underneath', async () => {
    signedIn();
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}/settings?modal=new-household`);

    const dialog = await screen.findByRole('dialog', { name: 'New household' });
    // The page stays rendered underneath (hidden from assistive tech while the modal is open).
    expect(
      screen.getByRole('heading', { name: 'Household settings', hidden: true }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(router.state.location.pathname).toBe(`/h/${testHousehold.id}/settings`);
  });

  it('goes back when it was opened inside the app', async () => {
    signedIn();
    const user = userEvent.setup();
    const router = renderRoute(`/h/${testHousehold.id}`);

    await user.click(
      await within(await sidebar()).findByRole('button', { name: /Otthon, switch household/ }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'New household' }));
    const dialog = await screen.findByRole('dialog', { name: 'New household' });
    const entriesWithModal = router.history.length;

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
    // Went back instead of pushing a new entry.
    expect(router.history.location.state.__TSR_index).toBe(0);
    expect(router.history.length).toBe(entriesWithModal);
  });

  it('ignores unknown modal names', async () => {
    signedIn();
    const router = renderRoute(`/h/${testHousehold.id}?modal=nope`);

    await screen.findByRole('heading', { name: greeting });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({});
  });
});
