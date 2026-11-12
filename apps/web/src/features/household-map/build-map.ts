import type {
  Balances,
  Budget,
  BudgetList,
  Category,
  Currency,
  HouseholdDetail,
  ImportBatch,
  Invite,
  RecurringList,
  StatementSource,
} from '@splinance/shared';
import { type BudgetStatus, budgetStatus, byUsage } from '@/features/budgets/status';
import { viewSeries } from '@/features/recurring/view';

/** A bank source is stale when its newest import is older than this. */
export const STALE_IMPORT_DAYS = 30;
/** Recurring payments shown per side (yours, the household's); the rest fold into one node. */
export const RECURRING_CAP = 3;
/** Budgets shown, most used first. */
export const BUDGET_CAP = 3;
/** Pending invites shown (there is rarely more than one). */
export const INVITE_CAP = 2;

const COLUMN_GAP = 270;
const ROW_GAP = 92;
/** People stand further apart: a debt between neighbours is drawn in the gap, with its amount. */
const MEMBER_ROW_GAP = 156;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Left to right: what is only yours, the people, the household, what the household shares. */
const COLUMN = { personal: 0, members: 1, household: 2, shared: 3 } as const;

export type MapNodeData =
  | { kind: 'household'; household: { id: string; name: string }; memberCount: number }
  | {
      kind: 'member';
      userId: string;
      displayName: string;
      isViewer: boolean;
      /** No longer a member, shown while a debt with them is open. */
      former: boolean;
      /** Across every open debt: positive when owed money, negative when owing. */
      net: number;
      /**
       * The viewer can record a payment with them: every other member, and someone who left
       * only while a debt between the two is open (the settle up dialog's own rule).
       */
      canSettle: boolean;
    }
  | { kind: 'bank'; source: StatementSource; daysAgo: number; stale: boolean }
  | {
      kind: 'recurring';
      seriesId: string;
      name: string;
      private: boolean;
      /** Recurring income (a salary) instead of a payment. */
      income: boolean;
      nextOn: string;
      daysUntil: number;
    }
  | { kind: 'more'; count: number }
  | {
      kind: 'budget';
      categoryId: string;
      /** Null when the category is not in the list (archived meanwhile). */
      name: string | null;
      budget: Pick<Budget, 'amount' | 'spent'>;
      status: BudgetStatus;
    }
  | { kind: 'invite'; inviteId: string; expiresAt: string };

export type MapNode = MapNodeData & { id: string; x: number; y: number };

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  /** `link`: belongs to. `pending`: not there yet (an invite). `debt`: source owes target. */
  kind: 'link' | 'pending' | 'debt';
  amount?: number;
  /**
   * How a debt runs between two people in the members column: straight `up` or `down` to
   * the neighbour, or around the `side` when someone stands between them.
   */
  route?: 'up' | 'down' | 'side';
}

export interface HouseholdMap {
  householdId: string;
  currency: Currency;
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface MapInput {
  household: HouseholdDetail;
  viewerId: string;
  balances: Balances;
  budgets: BudgetList;
  categories: Category[];
  recurring: RecurringList;
  /** The viewer's own imports (the API never returns anyone else's). */
  imports: ImportBatch[];
  /** Pending invites; empty for members who are not owners (they cannot list them). */
  invites: Invite[];
  /** The viewer's date, as the recurring page computes it. */
  today: string;
  now: Date;
}

/**
 * Dragging one person onto another means "settle up with them", as long as one of the two
 * is the viewer (a payment is always between you and someone) and the other can be settled
 * with. Returns the other person's user id.
 */
export function settleByDrop(dragged: MapNodeData, onto: MapNodeData): string | undefined {
  if (dragged.kind !== 'member' || onto.kind !== 'member') return undefined;
  const other = dragged.isViewer ? onto : onto.isViewer ? dragged : undefined;
  return other?.canSettle ? other.userId : undefined;
}

const HOUSEHOLD_ID = 'household';
const memberId = (userId: string) => `member:${userId}`;

/** Stacks a column's nodes around the canvas' horizontal axis. */
function place(
  column: number,
  items: (MapNodeData & { id: string })[],
  rowGap = ROW_GAP,
): MapNode[] {
  return items.map((item, index) => ({
    ...item,
    x: column * COLUMN_GAP,
    y: Math.round((index - (items.length - 1) / 2) * rowGap),
  }));
}

/**
 * The household as a graph, from what the overview already knows plus the viewer's imports
 * and (for owners) pending invites. Pure and text free: components turn it into labels.
 * It only arranges what the API returned, so private data stays as visible as it was.
 */
export function buildMap({
  household,
  viewerId,
  balances,
  budgets,
  categories,
  recurring,
  imports,
  invites,
  today,
  now,
}: MapInput): HouseholdMap {
  const edges: MapEdge[] = [];
  const link = (source: string, target: string, kind: MapEdge['kind'] = 'link') => {
    edges.push({ id: `${source}>${target}`, source, target, kind });
  };

  // People: the viewer first, then the other members, then anyone who left with a debt open.
  const net = new Map<string, number>();
  const names = new Map(household.members.map((m) => [m.userId, m.displayName]));
  for (const debt of balances.debts) {
    net.set(debt.to.userId, (net.get(debt.to.userId) ?? 0) + debt.amount);
    net.set(debt.from.userId, (net.get(debt.from.userId) ?? 0) - debt.amount);
    for (const person of [debt.from, debt.to]) {
      if (!names.has(person.userId)) names.set(person.userId, person.displayName);
    }
  }
  const current = new Set(household.members.map((m) => m.userId));
  const owesOrOwedByViewer = new Set(
    balances.debts
      .filter((debt) => debt.from.userId === viewerId || debt.to.userId === viewerId)
      .flatMap((debt) => [debt.from.userId, debt.to.userId]),
  );
  const people = [...names.keys()].sort((a, b) => Number(b === viewerId) - Number(a === viewerId));
  const memberNodes = people.map((userId) => ({
    id: memberId(userId),
    kind: 'member' as const,
    userId,
    displayName: names.get(userId) ?? '',
    isViewer: userId === viewerId,
    former: !current.has(userId),
    net: net.get(userId) ?? 0,
    canSettle: userId !== viewerId && (current.has(userId) || owesOrOwedByViewer.has(userId)),
  }));
  for (const node of memberNodes) if (!node.former) link(node.id, HOUSEHOLD_ID);
  for (const debt of balances.debts) {
    const source = memberId(debt.from.userId);
    const target = memberId(debt.to.userId);
    const step = people.indexOf(debt.to.userId) - people.indexOf(debt.from.userId);
    edges.push({
      id: `debt:${source}>${target}`,
      source,
      target,
      kind: 'debt',
      amount: debt.amount,
      route: step === -1 ? 'up' : step === 1 ? 'down' : 'side',
    });
  }

  // Yours: one node per bank you imported from (newest import that was not undone).
  const newest = new Map<StatementSource, string>();
  for (const batch of imports) {
    if (batch.undoneAt) continue;
    const seen = newest.get(batch.source);
    if (!seen || batch.createdAt > seen) newest.set(batch.source, batch.createdAt);
  }
  const bankNodes = [...newest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, createdAt]) => {
      const daysAgo = Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / DAY_MS));
      return {
        id: `bank:${source}`,
        kind: 'bank' as const,
        source,
        daysAgo,
        stale: daysAgo > STALE_IMPORT_DAYS,
      };
    });

  // Recurring payments, soonest first: private ones are yours, shared ones the household's.
  const views = recurring.series
    .map((series) => viewSeries(series, today, household.members.length))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.series.name.localeCompare(b.series.name));
  const recurringNodes = (isPrivate: boolean) => {
    const side = views.filter((view) => (view.series.scope === 'private') === isPrivate);
    const shown = side.slice(0, RECURRING_CAP).map((view) => ({
      id: `recurring:${view.series.id}`,
      kind: 'recurring' as const,
      seriesId: view.series.id,
      name: view.series.name,
      private: isPrivate,
      income: view.series.kind === 'income',
      nextOn: view.nextOn,
      daysUntil: view.daysUntil,
    }));
    const hidden = side.length - shown.length;
    return hidden > 0
      ? [
          ...shown,
          { id: `more:${isPrivate ? 'private' : 'shared'}`, kind: 'more' as const, count: hidden },
        ]
      : shown;
  };

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const budgetNodes = [...budgets.budgets]
    .sort(byUsage)
    .slice(0, BUDGET_CAP)
    .map((budget) => ({
      id: `budget:${budget.categoryId}`,
      kind: 'budget' as const,
      categoryId: budget.categoryId,
      name: categoryNames.get(budget.categoryId) ?? null,
      budget: { amount: budget.amount, spent: budget.spent },
      status: budgetStatus(budget),
    }));

  const inviteNodes = invites.slice(0, INVITE_CAP).map((invite) => ({
    id: `invite:${invite.id}`,
    kind: 'invite' as const,
    inviteId: invite.id,
    expiresAt: invite.expiresAt,
  }));

  const personal = [...bankNodes, ...recurringNodes(true)];
  const shared = [...recurringNodes(false), ...budgetNodes, ...inviteNodes];
  for (const node of personal) link(node.id, memberId(viewerId));
  for (const node of shared) {
    link(HOUSEHOLD_ID, node.id, node.kind === 'invite' ? 'pending' : 'link');
  }

  return {
    householdId: household.id,
    currency: balances.currency,
    nodes: [
      ...place(COLUMN.personal, personal),
      ...place(COLUMN.members, memberNodes, MEMBER_ROW_GAP),
      ...place(COLUMN.household, [
        {
          id: HOUSEHOLD_ID,
          kind: 'household',
          household: { id: household.id, name: household.name },
          memberCount: household.members.length,
        },
      ]),
      ...place(COLUMN.shared, shared),
    ],
    edges,
  };
}
