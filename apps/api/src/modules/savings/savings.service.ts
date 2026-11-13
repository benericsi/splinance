import {
  type DaySetAside,
  type Savings,
  type SavingsEntry,
  type SavingsEntryInput,
  type SavingsEntryListFilters,
  type SavingsEntryListResponse,
  type SavingsGoal,
  type SavingsGoalInput,
  SAVINGS_PIN_MAX,
  type SavingsQuery,
  type UpdateSavingsGoalInput,
} from '@splinance/shared';
import { and, desc, eq, gte, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import {
  householdMembers,
  savingsEntries,
  type SavingsEntryRow,
  savingsGoalPins,
  type SavingsGoalRow,
  savingsGoals,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { decodeCursor, encodeCursor } from '../../lib/keyset-cursor';
import {
  lockHouseholdShared,
  type Membership,
  requireMembership,
} from '../households/households.service';

export const goalNotFound = () =>
  new HttpError(404, 'Savings goal not found', 'SAVINGS_GOAL_NOT_FOUND');

export const entryNotFound = () =>
  new HttpError(404, 'Savings entry not found', 'SAVINGS_ENTRY_NOT_FOUND');

const goalArchived = () => new HttpError(409, 'This goal is closed', 'SAVINGS_GOAL_ARCHIVED');

const insufficientSavings = () =>
  new HttpError(409, 'The goal does not hold that much', 'INSUFFICIENT_SAVINGS');

const pinLimit = () =>
  new HttpError(409, `You can pin up to ${String(SAVINGS_PIN_MAX)} goals`, 'SAVINGS_PIN_LIMIT');

const notYourGoal = () =>
  new HttpError(403, 'Only the person who made this goal or an owner can change it', 'FORBIDDEN');

const notYourEntry = () =>
  new HttpError(403, 'Only the person who recorded this can remove it', 'FORBIDDEN');

interface HouseholdScope {
  userId: string;
  householdId: string;
}

export interface GoalScope extends HouseholdScope {
  goalId: string;
}

export interface EntryScope extends GoalScope {
  entryId: string;
}

/**
 * Savings' own privacy filter (transactions have `visibleTo`): shared goals, and private
 * ones only for the person who made them. Every read and write of a goal goes through it,
 * so a private goal is a 404 for everyone else, owners included.
 */
const goalVisibleTo = (userId: string) =>
  or(eq(savingsGoals.visibility, 'shared'), eq(savingsGoals.createdBy, userId));

const liveEntry = isNull(savingsEntries.deletedAt);

const entrySum = sql<number>`coalesce(sum(${savingsEntries.amount}), 0)::bigint`.mapWith(Number);

async function namesOf(executor: Db, userIds: Iterable<string>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const people = await executor
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(people.map((person) => [person.id, person.displayName]));
}

/**
 * API representations for the given rows, in the same order, with balances, names and the
 * viewer's own pins.
 */
async function toGoals(
  executor: Db,
  rows: SavingsGoalRow[],
  viewerId: string,
): Promise<SavingsGoal[]> {
  if (rows.length === 0) return [];
  const goalIds = rows.map((row) => row.id);
  const pins = await executor
    .select({ goalId: savingsGoalPins.goalId })
    .from(savingsGoalPins)
    .where(and(inArray(savingsGoalPins.goalId, goalIds), eq(savingsGoalPins.userId, viewerId)));
  const pinned = new Set(pins.map((pin) => pin.goalId));
  const sums = await executor
    .select({ goalId: savingsEntries.goalId, userId: savingsEntries.userId, amount: entrySum })
    .from(savingsEntries)
    .where(
      and(
        inArray(
          savingsEntries.goalId,
          rows.map((row) => row.id),
        ),
        liveEntry,
      ),
    )
    .groupBy(savingsEntries.goalId, savingsEntries.userId);

  const nameOf = await namesOf(executor, [
    ...rows.map((row) => row.createdBy),
    ...sums.map((sum) => sum.userId),
  ]);
  const person = (userId: string) => ({ userId, displayName: nameOf.get(userId) ?? '' });

  return rows.map((row) => {
    const own = sums.filter((sum) => sum.goalId === row.id);
    return {
      id: row.id,
      name: row.name,
      targetAmount: row.targetAmount,
      targetDate: row.targetDate,
      currency: row.currency,
      visibility: row.visibility,
      createdBy: person(row.createdBy),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      balance: own.reduce((total, sum) => total + sum.amount, 0),
      contributions: own
        .filter((sum) => sum.amount !== 0)
        .sort((a, b) => b.amount - a.amount || (a.userId < b.userId ? -1 : 1))
        .map((sum) => ({ ...person(sum.userId), amount: sum.amount })),
      pinned: pinned.has(row.id),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

async function toGoal(executor: Db, row: SavingsGoalRow, viewerId: string): Promise<SavingsGoal> {
  const [goal] = await toGoals(executor, [row], viewerId);
  if (!goal) throw new Error('toGoal returned nothing');
  return goal;
}

async function toEntries(executor: Db, rows: SavingsEntryRow[]): Promise<SavingsEntry[]> {
  const nameOf = await namesOf(
    executor,
    rows.map((row) => row.userId),
  );
  return rows.map((row) => ({
    id: row.id,
    user: { userId: row.userId, displayName: nameOf.get(row.userId) ?? '' },
    amount: row.amount,
    entryOn: row.entryOn,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The first day of the month and of the one after it. */
function monthRange(month: string): { start: string; end: string } {
  const year = Number(month.slice(0, 4));
  const next = Number(month.slice(5)) + 1;
  const end =
    next > 12 ? `${String(year + 1)}-01-01` : `${String(year)}-${String(next).padStart(2, '0')}-01`;
  return { start: `${month}-01`, end };
}

/**
 * The goals the viewer can see, active first, and (with a month) what they set aside in
 * it, in all and per day. Their own entries are always in goals they can see, so the sums
 * need no goal filter.
 */
export async function getSavings(scope: HouseholdScope, query: SavingsQuery): Promise<Savings> {
  const { household } = await requireMembership(db, scope);

  const rows = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.householdId, scope.householdId), goalVisibleTo(scope.userId)))
    .orderBy(sql`${savingsGoals.archivedAt} is not null`, savingsGoals.id);

  let setAside: number | null = null;
  let setAsideByDay: DaySetAside[] | null = null;
  if (query.month) {
    const { start, end } = monthRange(query.month);
    const days = await db
      .select({ date: savingsEntries.entryOn, amount: entrySum })
      .from(savingsEntries)
      .where(
        and(
          eq(savingsEntries.householdId, scope.householdId),
          eq(savingsEntries.userId, scope.userId),
          liveEntry,
          gte(savingsEntries.entryOn, start),
          lt(savingsEntries.entryOn, end),
        ),
      )
      .groupBy(savingsEntries.entryOn)
      .orderBy(savingsEntries.entryOn);
    // A day whose entries cancel out is no day of saving.
    setAsideByDay = days.filter((day) => day.amount !== 0);
    setAside = days.reduce((sum, day) => sum + day.amount, 0);
  }

  return {
    currency: household.baseCurrency,
    goals: await toGoals(db, rows, scope.userId),
    setAside,
    setAsideByDay,
  };
}

/** The goal if the viewer can see it. `lock` serializes writes that depend on its balance. */
async function findGoal(
  executor: Db,
  { userId, householdId, goalId }: GoalScope,
  { lock = false }: { lock?: boolean } = {},
): Promise<SavingsGoalRow> {
  const query = executor
    .select()
    .from(savingsGoals)
    .where(
      and(
        eq(savingsGoals.id, goalId),
        eq(savingsGoals.householdId, householdId),
        goalVisibleTo(userId),
      ),
    );
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw goalNotFound();
  return row;
}

export async function getGoal(scope: GoalScope): Promise<SavingsGoal> {
  await requireMembership(db, scope);
  return toGoal(db, await findGoal(db, scope), scope.userId);
}

/**
 * Every write: household lock (shared, like transaction writes, so leaving cannot slip in
 * between), then membership.
 */
async function inWriteTransaction<T>(
  scope: HouseholdScope,
  work: (tx: Db, membership: Membership) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockHouseholdShared(tx, scope.householdId);
    return work(tx, await requireMembership(tx, scope));
  });
}

export async function createGoal(
  scope: HouseholdScope,
  input: SavingsGoalInput,
): Promise<SavingsGoal> {
  return inWriteTransaction(scope, async (tx, membership) => {
    const [row] = await tx
      .insert(savingsGoals)
      .values({
        householdId: scope.householdId,
        name: input.name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate,
        // One currency per household until multi-currency.
        currency: membership.household.baseCurrency,
        visibility: input.visibility,
        createdBy: scope.userId,
      })
      .returning();
    if (!row) throw new Error('Savings goal insert returned no row');
    return toGoal(tx, row, scope.userId);
  });
}

/** The goal, locked, for a change to the goal itself: its maker or an owner, while open. */
async function findGoalToManage(
  tx: Db,
  scope: GoalScope,
  { role }: Membership,
): Promise<SavingsGoalRow> {
  const goal = await findGoal(tx, scope, { lock: true });
  if (role !== 'owner' && goal.createdBy !== scope.userId) throw notYourGoal();
  return goal;
}

export async function updateGoal(
  scope: GoalScope,
  input: UpdateSavingsGoalInput,
): Promise<SavingsGoal> {
  return inWriteTransaction(scope, async (tx, membership) => {
    const goal = await findGoalToManage(tx, scope, membership);
    if (goal.archivedAt) throw goalArchived();
    const [row] = await tx
      .update(savingsGoals)
      .set({ name: input.name, targetAmount: input.targetAmount, targetDate: input.targetDate })
      .where(eq(savingsGoals.id, goal.id))
      .returning();
    if (!row) throw goalNotFound();
    return toGoal(tx, row, scope.userId);
  });
}

/**
 * Closes the goal: it stays with its history and takes no new entries. Everyone's pins on
 * it go, so a closed goal holds no place on anyone's page. Idempotent.
 */
export async function archiveGoal(scope: GoalScope, now = new Date()): Promise<void> {
  await inWriteTransaction(scope, async (tx, membership) => {
    const goal = await findGoalToManage(tx, scope, membership);
    if (goal.archivedAt) return;
    await tx.update(savingsGoals).set({ archivedAt: now }).where(eq(savingsGoals.id, goal.id));
    await tx.delete(savingsGoalPins).where(eq(savingsGoalPins.goalId, goal.id));
  });
}

/** Newest first (by date, then id), paged with a keyset cursor. */
export async function listEntries(
  scope: GoalScope,
  query: SavingsEntryListFilters,
): Promise<SavingsEntryListResponse> {
  await requireMembership(db, scope);
  const goal = await findGoal(db, scope);

  const conditions: SQL[] = [eq(savingsEntries.goalId, goal.id), liveEntry];
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    conditions.push(
      sql`(${savingsEntries.entryOn}, ${savingsEntries.id}) < (${cursor.date}::date, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(savingsEntries)
    .where(and(...conditions))
    .orderBy(desc(savingsEntries.entryOn), desc(savingsEntries.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    entries: await toEntries(db, page),
    nextCursor:
      rows.length > query.limit && last ? encodeCursor({ date: last.entryOn, id: last.id }) : null,
  };
}

/** What the goal holds. Call it with the goal row locked, so it cannot change underneath. */
async function balanceOf(tx: Db, goalId: string): Promise<number> {
  const [sum] = await tx
    .select({ amount: entrySum })
    .from(savingsEntries)
    .where(and(eq(savingsEntries.goalId, goalId), liveEntry));
  return sum?.amount ?? 0;
}

/**
 * Puts money in or takes it out, as the caller: any member who can see the goal. The goal
 * row is locked first, so two withdrawals cannot both see the same balance and take the
 * goal below zero between them.
 */
export async function addEntry(
  scope: GoalScope,
  input: SavingsEntryInput,
): Promise<{ entry: SavingsEntry; goal: SavingsGoal }> {
  return inWriteTransaction(scope, async (tx) => {
    const goal = await findGoal(tx, scope, { lock: true });
    if (goal.archivedAt) throw goalArchived();
    if (input.amount < 0 && (await balanceOf(tx, goal.id)) + input.amount < 0) {
      throw insufficientSavings();
    }

    const [row] = await tx
      .insert(savingsEntries)
      .values({
        householdId: scope.householdId,
        goalId: goal.id,
        userId: scope.userId,
        amount: input.amount,
        entryOn: input.entryOn,
        note: input.note || null,
      })
      .returning();
    if (!row) throw new Error('Savings entry insert returned no row');

    const [entry] = await toEntries(tx, [row]);
    if (!entry) throw new Error('toEntries returned nothing');
    return { entry, goal: await toGoal(tx, goal, scope.userId) };
  });
}

/**
 * Soft delete, by the person who recorded it. Removing money that was put in is a
 * withdrawal in effect, so it is refused when others' withdrawals already used it.
 */
export async function deleteEntry(scope: EntryScope): Promise<void> {
  await inWriteTransaction(scope, async (tx) => {
    const goal = await findGoal(tx, scope, { lock: true });
    const [entry] = await tx
      .select()
      .from(savingsEntries)
      .where(
        and(eq(savingsEntries.id, scope.entryId), eq(savingsEntries.goalId, goal.id), liveEntry),
      );
    if (!entry) throw entryNotFound();
    if (entry.userId !== scope.userId) throw notYourEntry();
    if (goal.archivedAt) throw goalArchived();
    if (entry.amount > 0 && (await balanceOf(tx, goal.id)) - entry.amount < 0) {
      throw insufficientSavings();
    }
    await tx
      .update(savingsEntries)
      .set({ deletedAt: new Date() })
      .where(eq(savingsEntries.id, entry.id));
  });
}

/**
 * Keeps the goal on top of the caller's page. The limit is per person and household; the
 * caller's membership row is locked so two pins at once cannot both count below it.
 * Pinning a pinned goal changes nothing.
 */
export async function pinGoal(scope: GoalScope): Promise<void> {
  await inWriteTransaction(scope, async (tx) => {
    const goal = await findGoal(tx, scope);
    if (goal.archivedAt) throw goalArchived();
    await tx
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, scope.householdId),
          eq(householdMembers.userId, scope.userId),
        ),
      )
      .for('no key update');

    const pins = await tx
      .select({ goalId: savingsGoalPins.goalId })
      .from(savingsGoalPins)
      .where(
        and(
          eq(savingsGoalPins.householdId, scope.householdId),
          eq(savingsGoalPins.userId, scope.userId),
        ),
      );
    if (pins.some((pin) => pin.goalId === goal.id)) return;
    if (pins.length >= SAVINGS_PIN_MAX) throw pinLimit();
    await tx
      .insert(savingsGoalPins)
      .values({ householdId: scope.householdId, goalId: goal.id, userId: scope.userId });
  });
}

/** Unpinning a goal that is not pinned changes nothing. */
export async function unpinGoal(scope: GoalScope): Promise<void> {
  await inWriteTransaction(scope, async (tx) => {
    const goal = await findGoal(tx, scope);
    await tx
      .delete(savingsGoalPins)
      .where(and(eq(savingsGoalPins.goalId, goal.id), eq(savingsGoalPins.userId, scope.userId)));
  });
}
