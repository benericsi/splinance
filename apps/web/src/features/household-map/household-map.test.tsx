import type { HouseholdMember, ImportBatch, Invite } from '@splinance/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http as mock, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw';
import { renderRoute } from '../../../test/router';
import {
  authResponse,
  householdDetail,
  sentence,
  testHousehold,
  testUser,
} from '../../../test/utils';
import type { HouseholdMap } from './build-map';

// React Flow needs a real layout engine to measure and place nodes; jsdom has none. The
// canvas is replaced by a list of the same nodes, so everything up to it is real: the
// route, the queries, buildMap, what each node says and where it leads. The canvas itself
// (moving nodes, dropping one person on another) is covered e2e.
vi.mock('./components/household-map', async () => {
  const { MapNodeLink } = await import('./components/map-node-link');
  return {
    default: ({ map }: { map: HouseholdMap }) => (
      <section aria-label="Household map">
        {map.nodes.map((node) => (
          <MapNodeLink
            key={node.id}
            node={node}
            householdId={map.householdId}
            currency={map.currency}
          />
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

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

/**
 * The cards after switching from the map. The page can render the cards before the new
 * view's data has loaded and again once it has, so a node found on the first render may be
 * replaced (or still coming in) by the time it is checked: query again until it settles.
 */
async function cardsShown() {
  await waitFor(() => {
    expect(screen.getByText('Bela owes you')).toBeVisible();
  });
}

describe('the overview as a map', () => {
  it('shows the household, its people, your banks and a pending invite', async () => {
    restore = wideScreen();
    fakeApi();
    renderRoute(`${overview}?view=map`);

    const map = await screen.findByRole('region', { name: 'Household map' });
    expect(within(map).getByText('Otthon')).toBeVisible();
    expect(within(map).getByText('2 members')).toBeVisible();
    expect(within(map).getByText(`${testUser.displayName} (you)`)).toBeVisible();
    expect(within(map).getByText(sentence("You're owed 12 000 Ft"))).toHaveClass('text-positive');
    expect(within(map).getByText(sentence('Owes 12 000 Ft'))).toHaveClass('text-negative');
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
    await cardsShown();
    expect(router.state.location.search).toEqual({});
  });

  it('opens as a map when that is the person’s default; the URL says only what differs', async () => {
    restore = wideScreen();
    fakeApi();
    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(
          authResponse('access-1', {
            ...testUser,
            preferences: { ...testUser.preferences, overviewView: 'map' },
          }),
        ),
      ),
    );
    const router = renderRoute(overview);
    const user = userEvent.setup();

    expect(await screen.findByRole('region', { name: 'Household map' })).toBeVisible();
    const group = screen.getByRole('group', { name: 'Overview layout' });

    await user.click(within(group).getByRole('button', { name: 'Cards' }));
    await cardsShown();
    expect(router.state.location.search).toEqual({ view: 'cards' });

    await user.click(within(group).getByRole('button', { name: 'Map' }));
    expect(await screen.findByRole('region', { name: 'Household map' })).toBeVisible();
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

  it('stays on cards on a narrow screen, whatever the URL or the default says', async () => {
    fakeApi();
    server.use(
      mock.post('/api/auth/refresh', () =>
        HttpResponse.json(
          authResponse('access-1', {
            ...testUser,
            preferences: { ...testUser.preferences, overviewView: 'map' },
          }),
        ),
      ),
    );
    renderRoute(`${overview}?view=map`);

    expect(await screen.findByText('Bela owes you')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Household map' })).not.toBeInTheDocument();
  });

  it('makes every node the way to its page, by keyboard too', async () => {
    restore = wideScreen();
    fakeApi();
    const router = renderRoute(`${overview}?view=map`);
    const user = userEvent.setup();

    const map = await screen.findByRole('region', { name: 'Household map' });
    const href = (name: RegExp) => within(map).getByRole('link', { name }).getAttribute('href');
    expect(href(/Otthon/)).toBe(`${overview}/settings`);
    expect(href(/Revolut/)).toBe(`${overview}/transactions/import`);
    // The invite arrives on its own, after the rest.
    expect(await within(map).findByRole('link', { name: /Pending invite/ })).toHaveAttribute(
      'href',
      `${overview}/settings`,
    );
    // Your own card leads nowhere: there is nobody to settle with.
    expect(within(map).queryByRole('link', { name: /\(you\)/ })).not.toBeInTheDocument();

    within(map).getByRole('link', { name: /Bela/ }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Settle up' })).toBeVisible();
    expect(router.state.location.search).toEqual({ view: 'map', with: bela.userId });
    // Still the map underneath (hidden from assistive tech while the dialog is open).
    expect(screen.getByRole('region', { name: 'Household map', hidden: true })).toBeInTheDocument();
  });

  it('offers what can be added, the invite only to owners', async () => {
    restore = wideScreen();
    fakeApi();
    renderRoute(`${overview}?view=map`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    const menu = await screen.findByRole('menu');
    const items = Object.fromEntries(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => [item.textContent, item.getAttribute('href')]),
    );
    expect(items).toEqual({
      Transaction: `${overview}/transactions/new`,
      'Bank import': `${overview}/transactions/import`,
      'Recurring payment': `${overview}/recurring/new`,
      Budget: `${overview}/budgets/set`,
      'Settle up': `${overview}/settle?view=map`,
      'Invite someone': `${overview}/settings/invite`,
    });
  });

  it('does not offer the invite to a member who is not an owner', async () => {
    restore = wideScreen();
    fakeApi({ role: 'member' });
    renderRoute(`${overview}?view=map`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Budget' })).toBeVisible();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Invite someone' }),
    ).not.toBeInTheDocument();
  });

  it('takes a bank export dropped on the map to the import page', async () => {
    restore = wideScreen();
    fakeApi();
    const router = renderRoute(`${overview}?view=map`);

    const map = await screen.findByRole('region', { name: 'Household map' });
    const dataTransfer = {
      types: ['Files'],
      files: [new File(['not a statement'], 'export.csv', { type: 'text/csv' })],
    };
    fireEvent.dragOver(map, { dataTransfer });
    expect(screen.getByText('Drop the bank export to import it')).toBeVisible();
    fireEvent.drop(map, { dataTransfer });

    // The import page opens and reads the file straight away.
    expect(await screen.findByRole('heading', { name: 'Import from your bank' })).toBeVisible();
    expect(router.state.location.pathname).toBe(`${overview}/transactions/import`);
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('ignores a drag that carries no file', async () => {
    restore = wideScreen();
    fakeApi();
    const router = renderRoute(`${overview}?view=map`);

    const map = await screen.findByRole('region', { name: 'Household map' });
    const dataTransfer = { types: ['text/plain'], files: [] };
    fireEvent.dragOver(map, { dataTransfer });
    fireEvent.drop(map, { dataTransfer });
    expect(screen.queryByText('Drop the bank export to import it')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(overview);
  });
});
