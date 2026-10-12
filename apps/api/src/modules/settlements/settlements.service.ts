import type {
  AuditAction,
  Settlement,
  SettlementInput,
  SettlementListFilters,
  SettlementListResponse,
} from '@splinance/shared';
import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import {
  auditLog,
  householdMembers,
  type SettlementRow,
  settlements,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { decodeCursor, encodeCursor } from '../../lib/keyset-cursor';
import {
  lockHouseholdShared,
  type Membership,
  requireMembership,
} from '../households/households.service';

export const settlementNotFound = () =>
  new HttpError(404, 'Settlement not found', 'SETTLEMENT_NOT_FOUND');

const invalidMember = () =>
  new HttpError(400, 'Both people must be members of this household', 'INVALID_MEMBER');

const notYourPayment = () =>
  new HttpError(
    403,
    'Only the two people involved or an owner can record or remove this payment',
    'FORBIDDEN',
  );

interface HouseholdScope {
  userId: string;
  householdId: string;
}

export interface SettlementScope extends HouseholdScope {
  settlementId: string;
}

/** API representations for the given rows, in the same order, with names. */
async function toSettlements(executor: Db, rows: SettlementRow[]): Promise<Settlement[]> {
  if (rows.length === 0) return [];
  const ids = new Set<string>();
  for (const row of rows) ids.add(row.fromUserId).add(row.toUserId).add(row.createdBy);
  const people = await executor
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...ids]));
  const nameOf = new Map(people.map((person) => [person.id, person.displayName]));
  const person = (userId: string) => ({ userId, displayName: nameOf.get(userId) ?? '' });

  return rows.map((row) => ({
    id: row.id,
    from: person(row.fromUserId),
    to: person(row.toUserId),
    amount: row.amount,
    currency: row.currency,
    settledOn: row.settledOn,
    note: row.note,
    createdBy: person(row.createdBy),
    createdAt: row.createdAt.toISOString(),
  }));
}

async function toSettlement(executor: Db, row: SettlementRow): Promise<Settlement> {
  const [settlement] = await toSettlements(executor, [row]);
  if (!settlement) throw new Error('toSettlement returned nothing');
  return settlement;
}

/** Newest first (by date, then id), paged with a keyset cursor. Every member sees all. */
export async function listSettlements(
  scope: HouseholdScope,
  query: SettlementListFilters,
): Promise<SettlementListResponse> {
  await requireMembership(db, scope);

  const conditions: SQL[] = [
    eq(settlements.householdId, scope.householdId),
    isNull(settlements.deletedAt),
  ];
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    conditions.push(
      sql`(${settlements.settledOn}, ${settlements.id}) < (${cursor.date}::date, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(settlements)
    .where(and(...conditions))
    .orderBy(desc(settlements.settledOn), desc(settlements.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    settlements: await toSettlements(db, page),
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ date: last.settledOn, id: last.id })
        : null,
  };
}

/** The people involved and owners may record or remove a payment; other members may not. */
function assertMayManage(
  scope: HouseholdScope,
  { role }: Membership,
  people: { fromUserId: string; toUserId: string; createdBy?: string },
) {
  if (role === 'owner') return;
  const involved = [people.fromUserId, people.toUserId, people.createdBy];
  if (!involved.includes(scope.userId)) throw notYourPayment();
}

async function recordAudit(
  tx: Db,
  scope: HouseholdScope,
  action: AuditAction,
  entityId: string,
  before: Settlement | null,
  after: Settlement | null,
) {
  await tx.insert(auditLog).values({
    householdId: scope.householdId,
    actorId: scope.userId,
    entity: 'settlement',
    entityId,
    action,
    before,
    after,
  });
}

/**
 * Every write: household lock (shared, like transaction writes, so leaving cannot slip in
 * between), membership, then the change and its audit entry.
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

async function findSettlement(
  tx: Db,
  { householdId, settlementId }: SettlementScope,
  { deleted = false }: { deleted?: boolean } = {},
): Promise<SettlementRow | undefined> {
  const [row] = await tx
    .select()
    .from(settlements)
    .where(
      and(
        eq(settlements.id, settlementId),
        eq(settlements.householdId, householdId),
        deleted ? undefined : isNull(settlements.deletedAt),
      ),
    )
    .for('update');
  return row;
}

/**
 * Records a payment. Both people must have been members at some point: a debt with
 * someone who left (an old transaction corrected later) must stay settleable.
 */
export async function createSettlement(
  scope: HouseholdScope,
  input: SettlementInput,
): Promise<Settlement> {
  return inWriteTransaction(scope, async (tx, membership) => {
    assertMayManage(scope, membership, input);

    const people = await tx
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, scope.householdId),
          inArray(householdMembers.userId, [input.fromUserId, input.toUserId]),
        ),
      );
    if (people.length !== 2) throw invalidMember();

    const [row] = await tx
      .insert(settlements)
      .values({
        householdId: scope.householdId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amount: input.amount,
        // One currency per household until multi-currency (Phase 7).
        currency: membership.household.baseCurrency,
        settledOn: input.settledOn,
        note: input.note || null,
        createdBy: scope.userId,
      })
      .returning();
    if (!row) throw new Error('Settlement insert returned no row');

    const after = await toSettlement(tx, row);
    await recordAudit(tx, scope, 'create', row.id, null, after);
    return after;
  });
}

/** Soft delete: the debt it paid off is open again. */
export async function deleteSettlement(scope: SettlementScope): Promise<void> {
  await inWriteTransaction(scope, async (tx, membership) => {
    const existing = await findSettlement(tx, scope);
    if (!existing) throw settlementNotFound();
    assertMayManage(scope, membership, existing);

    const before = await toSettlement(tx, existing);
    await tx
      .update(settlements)
      .set({ deletedAt: new Date() })
      .where(eq(settlements.id, existing.id));
    await recordAudit(tx, scope, 'delete', existing.id, before, null);
  });
}

/** Undo for a delete. Restoring a settlement that is not deleted changes nothing. */
export async function restoreSettlement(scope: SettlementScope): Promise<Settlement> {
  return inWriteTransaction(scope, async (tx, membership) => {
    const existing = await findSettlement(tx, scope, { deleted: true });
    if (!existing) throw settlementNotFound();
    assertMayManage(scope, membership, existing);
    if (!existing.deletedAt) return toSettlement(tx, existing);

    const [row] = await tx
      .update(settlements)
      .set({ deletedAt: null })
      .where(eq(settlements.id, existing.id))
      .returning();
    if (!row) throw settlementNotFound();
    const after = await toSettlement(tx, row);
    await recordAudit(tx, scope, 'restore', row.id, null, after);
    return after;
  });
}
