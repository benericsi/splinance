import type { Budget, ImportBatch, Invite, RecurringSeries } from '@splinance/shared';
import { describe, expect, it } from 'vitest';
import { householdDetail, testHousehold, testUser } from '../../../test/utils';
import {
  BUDGET_CAP,
  buildMap,
  type MapInput,
  type MapNode,
  RECURRING_CAP,
  settleByDrop,
} from './build-map';

const anna = { userId: testUser.id, displayName: testUser.displayName };
const bela = { userId: '01a1216a-b248-781c-9cc6-cd68276fcdfc', displayName: 'Bela' };
const cili = { userId: '01a1216a-b248-781c-9cc6-cd68276fcdfd', displayName: 'Cili' };
const joinedAt = testHousehold.createdAt;

const uuid = (n: number) => `01a12509-0f61-75bc-b406-${String(n).padStart(12, '0')}`;

function series(n: number, overrides: Partial<RecurringSeries> = {}): RecurringSeries {
  return {
    id: uuid(n),
    kind: 'expense',
    source: 'manual',
    createdBy: anna.userId,
    name: `Series ${String(n)}`,
    pattern: `series ${String(n)}`,
    cadence: 'monthly',
    amount: 4_490,
    amountVaries: false,
    anchorOn: '2026-11-20',
    startsOn: null,
    categoryId: null,
    scope: 'shared',
    remind: true,
    payments: [],
    paymentCount: 0,
    lastPaidOn: null,
    latestAmount: 4_490,
    previousAmount: null,
    share: null,
    monthlyAmount: 4_490,
    ...overrides,
  };
}

function batch(n: number, overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: uuid(100 + n),
    source: 'revolut',
    fileName: null,
    rowCount: 10,
    createdBy: anna,
    createdAt: '2026-11-08T09:00:00.000Z',
    undoneAt: null,
    ...overrides,
  };
}

const budget = (n: number, amount: number, spent: number): Budget => ({
  categoryId: uuid(200 + n),
  amount,
  since: '2026-01',
  spent,
});

const invite: Invite = {
  id: uuid(300),
  invitedBy: anna,
  createdAt: '2026-11-10T09:00:00.000Z',
  expiresAt: '2026-11-17T09:00:00.000Z',
};

function input(overrides: Partial<MapInput> = {}): MapInput {
  return {
    household: householdDetail(testHousehold, [
      { ...anna, role: 'owner', joinedAt },
      { ...bela, role: 'member', joinedAt },
    ]),
    viewerId: anna.userId,
    balances: { currency: 'HUF', debts: [] },
    budgets: { month: '2026-11', currency: 'HUF', budgets: [] },
    categories: [],
    recurring: { currency: 'HUF', series: [], suggestions: [], dismissed: [] },
    imports: [],
    invites: [],
    today: '2026-11-11',
    now: new Date('2026-11-11T12:00:00.000Z'),
    ...overrides,
  };
}

const ofKind = <K extends MapNode['kind']>(nodes: MapNode[], kind: K) =>
  nodes.filter((node): node is Extract<MapNode, { kind: K }> => node.kind === kind);
const edgeIds = (map: ReturnType<typeof buildMap>) => map.edges.map((edge) => edge.id);

describe('buildMap', () => {
  it('puts the viewer first and links every member to the household', () => {
    const map = buildMap(input({ viewerId: bela.userId }));

    const members = ofKind(map.nodes, 'member');
    expect(members.map((m) => [m.displayName, m.isViewer])).toEqual([
      ['Bela', true],
      [anna.displayName, false],
    ]);
    expect(ofKind(map.nodes, 'household')[0]).toMatchObject({ memberCount: 2 });
    expect(edgeIds(map)).toEqual([
      `member:${bela.userId}>household`,
      `member:${anna.userId}>household`,
    ]);
  });

  it('nets debts per person and draws one edge per debt, debtor to creditor', () => {
    const map = buildMap(
      input({
        household: householdDetail(testHousehold, [
          { ...anna, role: 'owner', joinedAt },
          { ...bela, role: 'member', joinedAt },
          { ...cili, role: 'member', joinedAt },
        ]),
        balances: {
          currency: 'HUF',
          debts: [
            { from: bela, to: anna, amount: 12_000 },
            { from: cili, to: anna, amount: 3_000 },
            { from: bela, to: cili, amount: 500 },
          ],
        },
      }),
    );

    const net = Object.fromEntries(ofKind(map.nodes, 'member').map((m) => [m.displayName, m.net]));
    expect(net).toEqual({ [anna.displayName]: 15_000, Bela: -12_500, Cili: -2_500 });
    expect(map.edges.filter((edge) => edge.kind === 'debt')).toEqual([
      expect.objectContaining({
        source: `member:${bela.userId}`,
        target: `member:${anna.userId}`,
        amount: 12_000,
        // Bela stands right below Anna: straight up through the gap.
        route: 'up',
      }),
      // Bela stands between Cili and Anna: around the side.
      expect.objectContaining({ source: `member:${cili.userId}`, amount: 3_000, route: 'side' }),
      expect.objectContaining({ target: `member:${cili.userId}`, amount: 500, route: 'down' }),
    ]);
  });

  it('keeps someone who left while a debt with them is open, without a household link', () => {
    const map = buildMap(
      input({ balances: { currency: 'HUF', debts: [{ from: cili, to: anna, amount: 900 }] } }),
    );

    const former = ofKind(map.nodes, 'member').find((m) => m.userId === cili.userId);
    expect(former).toMatchObject({ displayName: 'Cili', former: true, net: -900 });
    expect(edgeIds(map)).not.toContain(`member:${cili.userId}>household`);
  });

  it('lets the viewer settle with members and with someone who left owing them, never themselves', () => {
    const settle = (debts: MapInput['balances']['debts']) =>
      Object.fromEntries(
        ofKind(buildMap(input({ balances: { currency: 'HUF', debts } })).nodes, 'member').map(
          (m) => [m.displayName, m.canSettle],
        ),
      );

    expect(settle([{ from: cili, to: anna, amount: 900 }])).toEqual({
      [anna.displayName]: false,
      Bela: true,
      Cili: true,
    });
    // Cili left owing Bela: that is between the two of them.
    expect(settle([{ from: cili, to: bela, amount: 900 }])).toMatchObject({ Cili: false });
  });

  it('shows one bank node per source from the newest import that was not undone', () => {
    const map = buildMap(
      input({
        imports: [
          batch(1, { createdAt: '2026-11-08T09:00:00.000Z' }),
          batch(2, { createdAt: '2026-10-01T09:00:00.000Z' }),
          batch(3, { source: 'kh', createdAt: '2026-10-01T09:00:00.000Z' }),
          batch(4, {
            source: 'kh',
            createdAt: '2026-11-10T09:00:00.000Z',
            undoneAt: '2026-11-10T10:00:00.000Z',
          }),
        ],
      }),
    );

    expect(ofKind(map.nodes, 'bank')).toEqual([
      expect.objectContaining({ source: 'kh', daysAgo: 41, stale: true }),
      expect.objectContaining({ source: 'revolut', daysAgo: 3, stale: false }),
    ]);
    expect(edgeIds(map)).toContain(`bank:kh>member:${anna.userId}`);
  });

  it('has no bank node when every import of a source was undone', () => {
    const map = buildMap(input({ imports: [batch(1, { undoneAt: '2026-11-09T09:00:00.000Z' })] }));
    expect(ofKind(map.nodes, 'bank')).toEqual([]);
  });

  it('hangs private series on the viewer and shared ones on the household, soonest first', () => {
    const map = buildMap(
      input({
        recurring: {
          currency: 'HUF',
          suggestions: [],
          dismissed: [],
          series: [
            series(1, { name: 'Rent', anchorOn: '2026-11-25' }),
            series(2, { name: 'Internet', anchorOn: '2026-11-14' }),
            series(3, { name: 'Gym', scope: 'private', anchorOn: '2026-11-12' }),
          ],
        },
      }),
    );

    const recurring = ofKind(map.nodes, 'recurring');
    expect(recurring.map((node) => [node.name, node.private, node.daysUntil])).toEqual([
      ['Gym', true, 1],
      ['Internet', false, 3],
      ['Rent', false, 14],
    ]);
    expect(edgeIds(map)).toEqual(
      expect.arrayContaining([
        `recurring:${uuid(3)}>member:${anna.userId}`,
        `household>recurring:${uuid(2)}`,
        `household>recurring:${uuid(1)}`,
      ]),
    );
  });

  it('folds series past the cap into one "more" node per side', () => {
    const shared = Array.from({ length: RECURRING_CAP + 2 }, (_, i) => series(i + 1));
    const map = buildMap(
      input({ recurring: { currency: 'HUF', suggestions: [], dismissed: [], series: shared } }),
    );

    expect(ofKind(map.nodes, 'recurring')).toHaveLength(RECURRING_CAP);
    expect(ofKind(map.nodes, 'more')).toEqual([
      expect.objectContaining({ id: 'more:shared', count: 2 }),
    ]);
    expect(edgeIds(map)).toContain('household>more:shared');
  });

  it('shows the most used budgets with their category names', () => {
    const budgets = [
      budget(1, 100_000, 10_000),
      budget(2, 100_000, 82_000),
      budget(3, 100_000, 120_000),
      budget(4, 100_000, 50_000),
    ];
    const map = buildMap(
      input({
        budgets: { month: '2026-11', currency: 'HUF', budgets },
        categories: [
          {
            id: uuid(203),
            name: 'Fun',
            kind: 'expense',
            icon: 'tag',
            color: 'pink',
            archivedAt: null,
          },
        ],
      }),
    );

    const nodes = ofKind(map.nodes, 'budget');
    expect(nodes).toHaveLength(BUDGET_CAP);
    expect(nodes.map((node) => [node.name, node.status])).toEqual([
      ['Fun', 'over'],
      [null, 'near'],
      [null, 'ok'],
    ]);
  });

  it('links pending invites to the household as pending', () => {
    const map = buildMap(input({ invites: [invite] }));

    expect(ofKind(map.nodes, 'invite')).toEqual([
      expect.objectContaining({ inviteId: invite.id, expiresAt: invite.expiresAt }),
    ]);
    expect(map.edges.find((edge) => edge.target === `invite:${invite.id}`)).toMatchObject({
      source: 'household',
      kind: 'pending',
    });
  });

  it('lays columns out left to right and centers each one vertically', () => {
    const map = buildMap(
      input({ imports: [batch(1), batch(2, { source: 'kh' })], invites: [invite] }),
    );

    const x = (kind: MapNode['kind']) => ofKind(map.nodes, kind)[0]?.x ?? NaN;
    expect(x('bank')).toBeLessThan(x('member'));
    expect(x('member')).toBeLessThan(x('household'));
    expect(x('household')).toBeLessThan(x('invite'));
    expect(ofKind(map.nodes, 'household')[0]?.y).toBe(0);
    const banks = ofKind(map.nodes, 'bank').map((node) => node.y);
    expect((banks[0] ?? 0) + (banks[1] ?? 0)).toBe(0);
  });
});

describe('settleByDrop', () => {
  const map = buildMap(
    input({
      household: householdDetail(testHousehold, [
        { ...anna, role: 'owner', joinedAt },
        { ...bela, role: 'member', joinedAt },
        { ...cili, role: 'member', joinedAt },
      ]),
      imports: [batch(1)],
    }),
  );
  const node = (id: string) => {
    const found = map.nodes.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`No node ${id}`);
    return found;
  };
  const me = node(`member:${anna.userId}`);
  const b = node(`member:${bela.userId}`);
  const c = node(`member:${cili.userId}`);

  it('settles with the other person, whichever of the two is dragged', () => {
    expect(settleByDrop(me, b)).toBe(bela.userId);
    expect(settleByDrop(b, me)).toBe(bela.userId);
  });

  it('does nothing between two other people, or with anything that is not a person', () => {
    expect(settleByDrop(b, c)).toBeUndefined();
    expect(settleByDrop(me, node('household'))).toBeUndefined();
    expect(settleByDrop(node('bank:revolut'), me)).toBeUndefined();
  });
});
