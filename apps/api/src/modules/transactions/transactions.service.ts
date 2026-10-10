import {
  type AuditAction,
  computeSplits,
  type SplitInput,
  type SplitMethod,
  type SplitSpec,
  type Transaction,
  type TransactionHistoryEntry,
  type TransactionInput,
  type TransactionListFilters,
  type TransactionListResponse,
  type UpdateTransactionInput,
} from '@splinance/shared';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import {
  auditLog,
  categories,
  householdMembers,
  transactions,
  type TransactionRow,
  transactionSplits,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import {
  lockHouseholdShared,
  type Membership,
  requireMembership,
} from '../households/households.service';

export const transactionNotFound = () =>
  new HttpError(404, 'Transaction not found', 'TRANSACTION_NOT_FOUND');

const versionConflict = () =>
  new HttpError(
    409,
    'Someone else changed this transaction. Reload it and try again',
    'VERSION_CONFLICT',
  );

const invalidCategory = () =>
  new HttpError(400, 'Choose an active category of the same kind', 'INVALID_CATEGORY');

const invalidMember = () =>
  new HttpError(400, 'Only members of this household can pay or share', 'INVALID_MEMBER');

const onlyAuthorCanMakePrivate = () =>
  new HttpError(403, 'Only the person who added it can make it private', 'FORBIDDEN');

const invalidCursor = () => new HttpError(400, 'Invalid cursor', 'VALIDATION_ERROR');

interface HouseholdScope {
  userId: string;
  householdId: string;
}

export interface TransactionScope extends HouseholdScope {
  transactionId: string;
}

/** `or()` is typed as possibly undefined (for an empty list); these lists never are. */
const anyOf = (...conditions: SQL[]): SQL => or(...conditions) ?? sql`false`;

/** Shared transactions are visible to every member, private ones only to their author. */
const visibleTo = (userId: string) =>
  anyOf(eq(transactions.visibility, 'shared'), eq(transactions.createdBy, userId));

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** API representations for the given rows, in the same order, with names and shares. */
async function toTransactions(executor: Db, rows: TransactionRow[]): Promise<Transaction[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const splitRows = await executor
    .select()
    .from(transactionSplits)
    .where(inArray(transactionSplits.transactionId, ids))
    .orderBy(asc(transactionSplits.userId));

  const userIds = new Set<string>();
  for (const row of rows) userIds.add(row.paidBy).add(row.createdBy);
  for (const split of splitRows) userIds.add(split.userId);
  const people = await executor
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  const nameOf = new Map(people.map((person) => [person.id, person.displayName]));
  const person = (userId: string) => ({ userId, displayName: nameOf.get(userId) ?? '' });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    visibility: row.visibility,
    amount: row.amount,
    currency: row.currency,
    occurredOn: row.occurredOn,
    description: row.description,
    categoryId: row.categoryId,
    paidBy: person(row.paidBy),
    createdBy: person(row.createdBy),
    split: row.splitMethod
      ? {
          method: row.splitMethod,
          shares: splitRows
            .filter((split) => split.transactionId === row.id)
            .map((split) => ({
              ...person(split.userId),
              amount: split.amount,
              basisPoints: split.basisPoints,
            })),
        }
      : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function toTransaction(executor: Db, row: TransactionRow): Promise<Transaction> {
  const [transaction] = await toTransactions(executor, [row]);
  if (!transaction) throw new Error('toTransaction returned nothing');
  return transaction;
}

/**
 * The transaction if the user may see it, else undefined. `lock` takes a row lock for the
 * rest of the database transaction, so the version check and the write cannot interleave
 * with another edit.
 */
async function findVisible(
  executor: Db,
  { userId, householdId, transactionId }: TransactionScope,
  { deleted = false, lock = false }: { deleted?: boolean; lock?: boolean } = {},
): Promise<TransactionRow | undefined> {
  const query = executor
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.householdId, householdId),
        visibleTo(userId),
        deleted ? undefined : isNull(transactions.deletedAt),
      ),
    );
  const [row] = lock ? await query.for('update') : await query;
  return row;
}

export async function getTransaction(scope: TransactionScope): Promise<Transaction> {
  await requireMembership(db, scope);
  const row = await findVisible(db, scope);
  if (!row) throw transactionNotFound();
  return toTransaction(db, row);
}

/** `occurred_on` and id of the last row of a page, base64url encoded. Opaque to clients. */
function encodeCursor(row: Pick<TransactionRow, 'occurredOn' | 'id'>): string {
  return Buffer.from(`${row.occurredOn}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { occurredOn: string; id: string } {
  const match = /^(\d{4}-\d{2}-\d{2})\|([0-9a-f-]{36})$/.exec(
    Buffer.from(cursor, 'base64url').toString(),
  );
  if (!match?.[1] || !match[2]) throw invalidCursor();
  return { occurredOn: match[1], id: match[2] };
}

/** First day of the month and of the month after, as `YYYY-MM-DD`. */
function monthRange(month: string): [string, string] {
  const [year = 0, monthIndex = 1] = month.split('-').map(Number);
  const next =
    monthIndex === 12
      ? `${String(year + 1)}-01`
      : `${String(year)}-${String(monthIndex + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

/** `%` and `_` are wildcards in LIKE; a search for "50%" means the literal text. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Newest first (by date, then id), paged with a keyset cursor so inserts never shift pages. */
export async function listTransactions(
  scope: HouseholdScope,
  query: TransactionListFilters,
): Promise<TransactionListResponse> {
  await requireMembership(db, scope);

  const conditions: SQL[] = [
    eq(transactions.householdId, scope.householdId),
    isNull(transactions.deletedAt),
    visibleTo(scope.userId),
  ];
  if (query.month) {
    const [from, to] = monthRange(query.month);
    conditions.push(gte(transactions.occurredOn, from), lt(transactions.occurredOn, to));
  }
  if (query.kind) conditions.push(eq(transactions.kind, query.kind));
  if (query.visibility) conditions.push(eq(transactions.visibility, query.visibility));
  if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId));
  if (query.memberId) {
    const memberId = query.memberId;
    const hasShare = db
      .select({ one: sql`1` })
      .from(transactionSplits)
      .where(
        and(
          eq(transactionSplits.transactionId, transactions.id),
          eq(transactionSplits.userId, memberId),
        ),
      );
    conditions.push(anyOf(eq(transactions.paidBy, memberId), exists(hasShare)));
  }
  if (query.q) {
    conditions.push(ilike(transactions.description, `%${escapeLike(query.q)}%`));
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    // Row comparison matches the (occurred_on desc, id desc) order of the index.
    conditions.push(
      sql`(${transactions.occurredOn}, ${transactions.id}) < (${cursor.occurredOn}::date, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.occurredOn), desc(transactions.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    transactions: await toTransactions(db, page),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}

export async function getTransactionHistory(
  scope: TransactionScope,
): Promise<TransactionHistoryEntry[]> {
  await requireMembership(db, scope);
  // Deleted transactions keep their history.
  const row = await findVisible(db, scope, { deleted: true });
  if (!row) throw transactionNotFound();

  const entries = await db
    .select({ entry: auditLog, actorName: users.displayName })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entity, 'transaction'), eq(auditLog.entityId, row.id)))
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id));

  return entries.map(({ entry, actorName }) => ({
    id: entry.id,
    action: entry.action,
    actor: { userId: entry.actorId, displayName: actorName },
    createdAt: entry.createdAt.toISOString(),
    before: entry.before,
    after: entry.after,
  }));
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

interface PreparedSplit {
  paidBy: string;
  splitMethod: SplitMethod | null;
  shares: { userId: string; amount: number; basisPoints: number | null }[];
}

/**
 * Sorted by user id: the largest remainder method gives leftover units to earlier
 * positions, so a stable order makes the same input always produce the same shares.
 */
function toSortedSpec(split: SplitInput): SplitSpec {
  // Plain code unit order: the same order Postgres uses for uuids (shares are read back by it).
  if (split.method === 'equal') return { method: 'equal', userIds: [...split.userIds].sort() };
  const byUser = <T extends { userId: string }>(a: T, b: T) =>
    a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  return split.method === 'percentage'
    ? { method: 'percentage', shares: [...split.shares].sort(byUser) }
    : { method: 'fixed', shares: [...split.shares].sort(byUser) };
}

/**
 * Payer and shares for the row. Everyone named must be in `allowed`: the active members,
 * plus (on edit) whoever was already on the transaction, so an old transaction involving
 * someone who left can still be corrected.
 */
function prepareSplit(
  input: TransactionInput,
  authorId: string,
  allowed: Set<string>,
): PreparedSplit {
  if (input.visibility === 'private') return { paidBy: authorId, splitMethod: null, shares: [] };

  const spec = toSortedSpec(input.split);
  const people = spec.method === 'equal' ? spec.userIds : spec.shares.map((s) => s.userId);
  if (![input.paidBy, ...people].every((userId) => allowed.has(userId))) throw invalidMember();

  const basisPointsOf = new Map(
    spec.method === 'percentage' ? spec.shares.map((s) => [s.userId, s.basisPoints]) : [],
  );
  return {
    paidBy: input.paidBy,
    splitMethod: spec.method,
    shares: computeSplits(input.amount, spec).map((share) => ({
      ...share,
      basisPoints: basisPointsOf.get(share.userId) ?? null,
    })),
  };
}

async function activeMemberIds(tx: Db, householdId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), isNull(householdMembers.leftAt)));
  return new Set(rows.map((row) => row.userId));
}

/** New category references must be active and of the transaction's kind. */
async function assertUsableCategory(
  tx: Db,
  householdId: string,
  categoryId: string,
  kind: TransactionInput['kind'],
): Promise<void> {
  const [row] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.householdId, householdId),
        eq(categories.kind, kind),
        isNull(categories.archivedAt),
      ),
    );
  if (!row) throw invalidCategory();
}

async function replaceSplits(tx: Db, row: TransactionRow, shares: PreparedSplit['shares']) {
  await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, row.id));
  if (shares.length === 0) return;
  await tx
    .insert(transactionSplits)
    .values(
      shares.map((share) => ({ ...share, transactionId: row.id, householdId: row.householdId })),
    );
}

async function recordAudit(
  tx: Db,
  scope: HouseholdScope,
  action: AuditAction,
  entityId: string,
  before: Transaction | null,
  after: Transaction | null,
) {
  await tx.insert(auditLog).values({
    householdId: scope.householdId,
    actorId: scope.userId,
    entity: 'transaction',
    entityId,
    action,
    before,
    after,
  });
}

/** Every write: household lock (shared), membership, then the change and its audit entry. */
async function inWriteTransaction<T>(
  scope: HouseholdScope,
  work: (tx: Db, membership: Membership) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockHouseholdShared(tx, scope.householdId);
    return work(tx, await requireMembership(tx, scope));
  });
}

export async function createTransaction(
  scope: HouseholdScope,
  input: TransactionInput,
): Promise<Transaction> {
  return inWriteTransaction(scope, async (tx, { household }) => {
    if (input.categoryId) {
      await assertUsableCategory(tx, scope.householdId, input.categoryId, input.kind);
    }
    const split = prepareSplit(input, scope.userId, await activeMemberIds(tx, scope.householdId));

    const [row] = await tx
      .insert(transactions)
      .values({
        householdId: scope.householdId,
        createdBy: scope.userId,
        paidBy: split.paidBy,
        kind: input.kind,
        visibility: input.visibility,
        amount: input.amount,
        // One currency per household until multi-currency (Phase 7).
        currency: household.baseCurrency,
        occurredOn: input.occurredOn,
        description: input.description,
        categoryId: input.categoryId,
        splitMethod: split.splitMethod,
      })
      .returning();
    if (!row) throw new Error('Transaction insert returned no row');
    await replaceSplits(tx, row, split.shares);

    const after = await toTransaction(tx, row);
    await recordAudit(tx, scope, 'create', row.id, null, after);
    return after;
  });
}

export async function updateTransaction(
  scope: TransactionScope,
  { version, ...input }: UpdateTransactionInput,
): Promise<Transaction> {
  return inWriteTransaction(scope, async (tx) => {
    const existing = await findVisible(tx, scope, { lock: true });
    if (!existing) throw transactionNotFound();
    if (existing.version !== version) throw versionConflict();
    if (input.visibility === 'private' && existing.createdBy !== scope.userId) {
      throw onlyAuthorCanMakePrivate();
    }

    // Keeping the current category is fine even if it was archived since.
    const sameCategory = input.categoryId === existing.categoryId && input.kind === existing.kind;
    if (input.categoryId && !sameCategory) {
      await assertUsableCategory(tx, scope.householdId, input.categoryId, input.kind);
    }

    const before = await toTransaction(tx, existing);
    const allowed = await activeMemberIds(tx, scope.householdId);
    allowed.add(existing.paidBy);
    for (const share of before.split?.shares ?? []) allowed.add(share.userId);
    const split = prepareSplit(input, existing.createdBy, allowed);

    const [row] = await tx
      .update(transactions)
      .set({
        paidBy: split.paidBy,
        kind: input.kind,
        visibility: input.visibility,
        amount: input.amount,
        occurredOn: input.occurredOn,
        description: input.description,
        categoryId: input.categoryId,
        splitMethod: split.splitMethod,
        version: existing.version + 1,
      })
      .where(eq(transactions.id, existing.id))
      .returning();
    if (!row) throw transactionNotFound();
    await replaceSplits(tx, row, split.shares);

    const after = await toTransaction(tx, row);
    await recordAudit(tx, scope, 'update', row.id, before, after);
    return after;
  });
}

/** Soft delete: gone from lists and balances, kept for history and restore. */
export async function deleteTransaction(scope: TransactionScope): Promise<void> {
  await inWriteTransaction(scope, async (tx) => {
    const existing = await findVisible(tx, scope, { lock: true });
    if (!existing) throw transactionNotFound();
    const before = await toTransaction(tx, existing);
    await tx
      .update(transactions)
      .set({ deletedAt: new Date(), version: existing.version + 1 })
      .where(eq(transactions.id, existing.id));
    await recordAudit(tx, scope, 'delete', existing.id, before, null);
  });
}

/** Undo for a delete. Restoring a transaction that is not deleted changes nothing. */
export async function restoreTransaction(scope: TransactionScope): Promise<Transaction> {
  return inWriteTransaction(scope, async (tx) => {
    const existing = await findVisible(tx, scope, { deleted: true, lock: true });
    if (!existing) throw transactionNotFound();
    if (!existing.deletedAt) return toTransaction(tx, existing);

    const [row] = await tx
      .update(transactions)
      .set({ deletedAt: null, version: existing.version + 1 })
      .where(eq(transactions.id, existing.id))
      .returning();
    if (!row) throw transactionNotFound();
    const after = await toTransaction(tx, row);
    await recordAudit(tx, scope, 'restore', row.id, null, after);
    return after;
  });
}
