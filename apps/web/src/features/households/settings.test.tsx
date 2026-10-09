import type { Household, HouseholdDetail, HouseholdMember } from '@splinance/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, getField, testHousehold, testUser } from '../../../test/utils';

const bela: HouseholdMember = {
  userId: '01a1216a-b248-781c-9cc6-cd68276fcdfc',
  displayName: 'Bela',
  role: 'member',
  joinedAt: '2026-10-09T16:06:43.492Z',
};

const trip: Household = {
  ...testHousehold,
  id: '01a1216a-b2bb-76cc-aa3b-00e98252d140',
  name: 'Balaton trip',
};

/** A tiny in-memory API: Anna (the logged-in user) with `role` in Otthon, plus Bela. */
function fakeApi(role: 'owner' | 'member' = 'owner') {
  const state = {
    household: {
      ...testHousehold,
      role,
      members: [
        {
          userId: testUser.id,
          displayName: testUser.displayName,
          role,
          joinedAt: testHousehold.createdAt,
        },
        bela,
      ],
    } satisfies HouseholdDetail,
    inOtthon: true,
    requests: [] as { method: string; path: string; body: unknown }[],
  };
  const record = async (request: Request) => {
    const body: unknown =
      request.method === 'GET' ? undefined : await request.json().catch(() => undefined);
    state.requests.push({ method: request.method, path: new URL(request.url).pathname, body });
  };
  const list = () => (state.inOtthon ? [state.household, trip] : [trip]);

  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/health/live', () => HttpResponse.json({ status: 'ok', uptimeSeconds: 1 })),
    mock.get('/api/health/ready', () =>
      HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
    ),
    mock.get('/api/households', () => HttpResponse.json({ households: list() })),
    mock.get(`/api/households/${trip.id}`, () =>
      HttpResponse.json({ household: { ...trip, members: [] } }),
    ),
    mock.get(`/api/households/${testHousehold.id}`, () =>
      state.inOtthon
        ? HttpResponse.json({ household: state.household })
        : HttpResponse.json(
            { error: { code: 'HOUSEHOLD_NOT_FOUND', message: 'x' } },
            { status: 404 },
          ),
    ),
    mock.patch(`/api/households/${testHousehold.id}`, async ({ request }) => {
      await record(request.clone());
      const { name } = (await request.json()) as { name: string };
      state.household = { ...state.household, name };
      return HttpResponse.json({ household: state.household });
    }),
    mock.patch(`/api/households/${testHousehold.id}/members/:userId`, async ({ request }) => {
      await record(request.clone());
      const { role: next } = (await request.json()) as { role: 'owner' | 'member' };
      const members = state.household.members.map((m) =>
        m.userId === bela.userId ? { ...m, role: next } : m,
      );
      state.household = { ...state.household, members };
      return HttpResponse.json({ member: { ...bela, role: next } });
    }),
    mock.delete(`/api/households/${testHousehold.id}/members/:userId`, async ({ request }) => {
      await record(request);
      state.household = {
        ...state.household,
        members: state.household.members.filter((m) => m.userId !== bela.userId),
      };
      return new HttpResponse(null, { status: 204 });
    }),
    mock.post(`/api/households/${testHousehold.id}/leave`, async ({ request }) => {
      await record(request);
      state.inOtthon = false;
      return new HttpResponse(null, { status: 204 });
    }),
    mock.delete(`/api/households/${testHousehold.id}`, async ({ request }) => {
      await record(request);
      state.inOtthon = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

const settingsPath = `/h/${testHousehold.id}/settings`;

afterEach(() => {
  localStorage.clear();
});

describe('household settings as owner', () => {
  it('renames the household inline', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const field = getField('Name');
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, '  Flat  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Flat', { selector: 'p' })).toBeVisible();
    expect(api.requests).toEqual([
      { method: 'PATCH', path: `/api/households/${testHousehold.id}`, body: { name: 'Flat' } },
    ]);
  });

  it('cancels renaming with Escape without a request', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    await user.type(getField('Name'), ' changed');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Rename' })).toBeVisible();
    expect(api.requests).toEqual([]);
  });

  it('makes a member an owner from the member menu', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Actions for Bela' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Make owner' }));

    await waitFor(() => {
      expect(api.requests).toEqual([
        {
          method: 'PATCH',
          path: `/api/households/${testHousehold.id}/members/${bela.userId}`,
          body: { role: 'owner' },
        },
      ]);
    });
    expect(await screen.findAllByText('Owner')).toHaveLength(2);
  });

  it('removes a member after confirming', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Actions for Bela' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from household' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Bela?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `DELETE /api/households/${testHousehold.id}/members/${bela.userId}`,
    ]);
    expect(screen.queryByText('Bela')).not.toBeInTheDocument();
  });

  it('explains instead of leaving when the user is the only owner', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    const dialog = await screen.findByRole('alertdialog', { name: "You're the only owner" });
    expect(within(dialog).queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
    expect(api.requests).toEqual([]);
  });

  it('archives only after the name is typed, then leaves the household', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    const router = renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Otthon?' });
    const confirm = within(dialog).getByRole('button', { name: 'Archive' });

    await user.click(confirm);
    expect(within(dialog).getByText('The name does not match.')).toBeVisible();
    expect(api.requests).toEqual([]);

    await user.type(within(dialog).getByLabelText('Type Otthon to confirm'), 'Otthon');
    await user.click(confirm);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${trip.id}`);
    });
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `DELETE /api/households/${testHousehold.id}`,
    ]);
  });
});

describe('household settings as member', () => {
  it('shows no owner controls', async () => {
    fakeApi('member');
    renderRoute(settingsPath);

    expect(await screen.findByRole('heading', { name: 'Household settings' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('leaves after confirming and moves on to another household', async () => {
    const api = fakeApi('member');
    const user = userEvent.setup();
    const router = renderRoute(settingsPath);

    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave Otthon?' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/h/${trip.id}`);
    });
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /api/households/${testHousehold.id}/leave`,
    ]);
  });
});
