import type { HouseholdMember, ImportBatch, Invite } from '@splinance/shared';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import { authResponse, householdDetail, testHousehold, testUser } from '../../../test/utils';
import type { HouseholdMap } from './build-map';

// React Flow needs a real layout engine to measure and place nodes; jsdom has none. The
// canvas is replaced by a list of the same cards, so everything up to it is real: the
// route, the queries, buildMap and what each node says. The canvas itself is covered e2e.
vi.mock('./components/household-map', async () => {
  const { MapNodeCard } = await import('./components/map-node-card');
  return {
    default: ({ map }: { map: HouseholdMap }) => (
      <section aria-label="Household map">
        {map.nodes.map((node) => (
          <MapNodeCard key={node.id} node={node} currency={map.currency} />
        ))}
      </section>
    ),
  };
});

const anna = { userId: testUser.id, displayName: testUser.displayName };
const bela: HouseholdMember = {
  userId: '01a1216a-b248-781c-9cc6-cd68276fcdfc',
  displayName: 'Bela',
  role: 'member',
  joinedAt: testHousehold.createdAt,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS - 60_000).toISOString();

const batch = (source: ImportBatch['source'], days: number): ImportBatch => ({
  id: `01a12509-0f61-75bc-b406-00000000000${String(days % 10)}`,
  source,
  fileName: null,
  rowCount: 12,
  createdBy: anna,
  createdAt: daysAgo(days),
  undoneAt: null,
});

const invite: Invite = {
  id: '01a12509-0f61-75bc-b406-000000000300',
  invitedBy: anna,
  createdAt: daysAgo(1),
  expiresAt: new Date(Date.now() + 5 * DAY_MS).toISOString(),
};

const base = `/api/households/${testHousehold.id}`;
const overview = `/h/${testHousehold.id}`;

function fakeApi({ role = 'owner' }: { role?: HouseholdMember['role'] } = {}) {
  const household = { ...testHousehold, role };
  server.use(
    mock.post('/api/auth/refresh', () => HttpResponse.json(authResponse())),
    mock.get('/api/households', () => HttpResponse.json({ households: [household] })),
    mock.get(base, () =>
      HttpResponse.json({
        household: householdDetail(household, [
          { ...anna, role, joinedAt: testHousehold.createdAt },
          bela,
        ]),
      }),
    ),
    mock.get(`${base}/balances`, () =>
      HttpResponse.json({
        balances: {
          currency: 'HUF',
          debts: [{ from: { userId: bela.userId, displayName: 'Bela' }, to: anna, amount: 12_000 }],
        },
      }),
    ),
    mock.get(`${base}/imports`, () =>
      HttpResponse.json({ batches: [batch('revolut', 3), batch('kh', 41)] }),
    ),
    // Members who are not owners may not list invites; the map must not ask for them.
    ...(role === 'owner'
      ? [mock.get(`${base}/invites`, () => HttpResponse.json({ invites: [invite] }))]
      : []),
  );
}

/** The map only shows on wide screens; jsdom's default matchMedia matches nothing. */
function wideScreen() {
  const narrow = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  if (!narrow) throw new Error('No matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    ...narrow,
    value: (query: string) =>
      ({
        matches: query.includes('768px'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  });
  return () => {
    Object.defineProperty(window, 'matchMedia', narrow);
  };
}

/** Intl writes no-break spaces in amounts; match any whitespace. */
const money = (text: string) => new RegExp(text.replace(/ /g, '\\s'));

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('the overview as a map', () => {
  it('shows the household, its people, your banks and a pending invite', async () => {
    restore = wideScreen();
    fakeApi();
    renderRoute(`${overview}?view=map`);

    const map = await screen.findByRole('region', { name: 'Household map' });
    expect(within(map).getByText('Otthon')).toBeVisible();
    expect(within(map).getByText('2 members')).toBeVisible();
    expect(within(map).getByText(`${testUser.displayName} (you)`)).toBeVisible();
    expect(within(map).getByText(money("You're owed 12 000 Ft"))).toHaveClass('text-positive');
    expect(within(map).getByText(money('Owes 12 000 Ft'))).toHaveClass('text-negative');
    expect(within(map).getByText('Imported 3 days ago')).toHaveClass('text-muted-foreground');
    // Older than a month: time to import again.
    expect(within(map).getByText('K&H')).toBeVisible();
    expect(within(map).getByText('Imported 41 days ago')).toHaveClass('text-warning');
    expect(await within(map).findByText('Pending invite')).toBeVisible();
    expect(within(map).getByText('Expires in 5 days')).toBeVisible();
    // The cards are replaced, not stacked under the map.
    expect(screen.queryByText('Bela owes you')).not.toBeInTheDocument();
  });

  it('switches between cards and map, keeping the choice in the URL', async () => {
    restore = wideScreen();
    fakeApi();
    const router = renderRoute(overview);
    const user = userEvent.setup();

    expect(await screen.findByText('Bela owes you')).toBeVisible();
    const group = screen.getByRole('group', { name: 'Overview layout' });
    expect(within(group).getByRole('button', { name: 'Cards' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(group).getByRole('button', { name: 'Map' }));
    expect(await screen.findByRole('region', { name: 'Household map' })).toBeVisible();
    expect(router.state.location.search).toEqual({ view: 'map' });

    await user.click(within(group).getByRole('button', { name: 'Cards' }));
    expect(await screen.findByText('Bela owes you')).toBeVisible();
    expect(router.state.location.search).toEqual({});
  });

  it('does not ask for invites as a member who is not an owner', async () => {
    restore = wideScreen();
    fakeApi({ role: 'member' });
    renderRoute(`${overview}?view=map`);

    const map = await screen.findByRole('region', { name: 'Household map' });
    expect(within(map).getByText('Revolut')).toBeVisible();
    expect(within(map).queryByText('Pending invite')).not.toBeInTheDocument();
  });

  it('stays on cards on a narrow screen, whatever the URL says', async () => {
    fakeApi();
    renderRoute(`${overview}?view=map`);

    expect(await screen.findByText('Bela owes you')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Household map' })).not.toBeInTheDocument();
  });
});
