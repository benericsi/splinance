import type {
  ImportBatch,
  ImportCheckInput,
  ImportCheckResult,
  ImportInput,
  ImportResponse,
} from '@splinance/shared';
import { and, between, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import { type ImportBatchRow, importBatches, transactions, users } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { lockHouseholdShared, requireMembership } from '../households/households.service';
import {
  activeMemberIds,
  type HouseholdScope,
  insertTransaction,
  softDeleteTransaction,
} from '../transactions/transactions.service';

export const importNotFound = () => new HttpError(404, 'Import not found', 'IMPORT_NOT_FOUND');

/** Hand-entered transactions this many days apart still count as possible duplicates. */
const DUPLICATE_WINDOW_DAYS = 2;
const DAY_MS = 86_400_000;

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const shiftDays = (date: string, days: number) =>
  new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);

async function toBatches(executor: Db, rows: ImportBatchRow[]): Promise<ImportBatch[]> {
  if (rows.length === 0) return [];
  const people = await executor
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...new Set(rows.map((row) => row.createdBy))]));
  const nameOf = new Map(people.map((person) => [person.id, person.displayName]));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    fileName: row.fileName,
    rowCount: row.rowCount,
    createdBy: { userId: row.createdBy, displayName: nameOf.get(row.createdBy) ?? '' },
    createdAt: row.createdAt.toISOString(),
    undoneAt: row.undoneAt?.toISOString() ?? null,
  }));
}

/**
 * How each row relates to what is there already, from the caller's side. Fingerprints are
 * per person: the same bank row imported by someone else is theirs, not a duplicate.
 */
export async function checkImport(
  scope: HouseholdScope,
  input: ImportCheckInput,
): Promise<ImportCheckResult[]> {
  await requireMembership(db, scope);
  const fingerprints = [...new Set(input.rows.map((row) => row.fingerprint))];

  const imported = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      occurredOn: transactions.occurredOn,
      fingerprint: transactions.importFingerprint,
      deletedAt: transactions.deletedAt,
      undoneAt: importBatches.undoneAt,
    })
    .from(transactions)
    .innerJoin(importBatches, eq(importBatches.id, transactions.importBatchId))
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.createdBy, scope.userId),
        inArray(transactions.importFingerprint, fingerprints),
      ),
    );

  // A live copy wins over deleted ones; among deleted ones, one removed by undoing its import
  // wins (it says "import again"), a delete of its own otherwise says "not wanted".
  const byUndo = (row: (typeof imported)[number]) =>
    row.deletedAt !== null && row.deletedAt.getTime() === row.undoneAt?.getTime();
  const rank = (row: (typeof imported)[number]) => (!row.deletedAt ? 0 : byUndo(row) ? 1 : 2);
  const byFingerprint = new Map<string, (typeof imported)[number]>();
  for (const row of imported) {
    const current = row.fingerprint ? byFingerprint.get(row.fingerprint) : undefined;
    if (row.fingerprint && (!current || rank(row) < rank(current))) {
      byFingerprint.set(row.fingerprint, row);
    }
  }

  // Hand-entered transactions the caller paid for (private ones are always theirs), around
  // the rows' dates and with their amounts.
  const dates = input.rows.map((row) => row.occurredOn).sort();
  const first = dates[0] ?? '2000-01-01';
  const last = dates.at(-1) ?? first;
  const candidates = await db
    .select({
      id: transactions.id,
      kind: transactions.kind,
      amount: transactions.amount,
      description: transactions.description,
      occurredOn: transactions.occurredOn,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.paidBy, scope.userId),
        isNull(transactions.deletedAt),
        isNull(transactions.importFingerprint),
        inArray(transactions.amount, [...new Set(input.rows.map((row) => row.amount))]),
        between(
          transactions.occurredOn,
          shiftDays(first, -DUPLICATE_WINDOW_DAYS),
          shiftDays(last, DUPLICATE_WINDOW_DAYS),
        ),
      ),
    )
    .orderBy(transactions.occurredOn, transactions.id);
  const used = new Set<string>();

  return input.rows.map((row) => {
    const known = byFingerprint.get(row.fingerprint);
    if (known) {
      return {
        fingerprint: row.fingerprint,
        status: !known.deletedAt ? 'imported' : byUndo(known) ? 'undone' : 'deleted',
        match: { id: known.id, description: known.description, occurredOn: known.occurredOn },
      };
    }

    // The closest unused hand-entered transaction of the same kind and amount.
    let best: (typeof candidates)[number] | undefined;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      if (used.has(candidate.id) || candidate.kind !== row.kind || candidate.amount !== row.amount)
        continue;
      const distance = Math.abs(dayNumber(candidate.occurredOn) - dayNumber(row.occurredOn));
      if (distance <= DUPLICATE_WINDOW_DAYS && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (!best) return { fingerprint: row.fingerprint, status: 'new', match: null };
    used.add(best.id);
    return {
      fingerprint: row.fingerprint,
      status: 'possible-duplicate',
      match: { id: best.id, description: best.description, occurredOn: best.occurredOn },
    };
  });
}

/**
 * Creates the batch and its transactions in one database transaction. Rows the caller
 * already has (imported in the meantime, or twice in this request) are skipped and
 * counted; a row the transaction rules refuse fails the whole import, naming the row.
 */
export async function createImport(
  scope: HouseholdScope,
  input: ImportInput,
): Promise<ImportResponse> {
  try {
    return await db.transaction(async (tx) => {
      await lockHouseholdShared(tx, scope.householdId);
      const { household } = await requireMembership(tx, scope);

      const live = await tx
        .select({ fingerprint: transactions.importFingerprint })
        .from(transactions)
        .where(
          and(
            eq(transactions.householdId, scope.householdId),
            eq(transactions.createdBy, scope.userId),
            isNull(transactions.deletedAt),
            isNotNull(transactions.importFingerprint),
            inArray(
              transactions.importFingerprint,
              input.rows.map((row) => row.fingerprint),
            ),
          ),
        );
      const taken = new Set(live.map((row) => row.fingerprint));
      const rows = input.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
          if (taken.has(row.fingerprint)) return false;
          taken.add(row.fingerprint);
          return true;
        });
      if (rows.length === 0) {
        throw new HttpError(409, 'Everything in this import is there already', 'NOTHING_TO_IMPORT');
      }

      const [batch] = await tx
        .insert(importBatches)
        .values({
          householdId: scope.householdId,
          createdBy: scope.userId,
          source: input.source,
          fileName: input.fileName || null,
          rowCount: rows.length,
        })
        .returning();
      if (!batch) throw new Error('Import batch insert returned no row');

      const allowed = await activeMemberIds(tx, scope.householdId);
      for (const { row, index } of rows) {
        try {
          await insertTransaction(tx, scope, household, row.transaction, allowed, {
            importBatchId: batch.id,
            importFingerprint: row.fingerprint,
            counterparty: row.counterparty || null,
          });
        } catch (error) {
          if (error instanceof HttpError) {
            throw new HttpError(
              error.status,
              `Row ${String(index + 1)}: ${error.message}`,
              error.code,
            );
          }
          throw error;
        }
      }

      const [created] = await toBatches(tx, [batch]);
      if (!created) throw new Error('toBatches returned nothing');
      return { batch: created, skipped: input.rows.length - rows.length };
    });
  } catch (error) {
    // Two imports of the same rows at once: the second one lost the race.
    if (isUniqueViolation(error, 'transactions_import_fingerprint_unique')) {
      throw new HttpError(409, 'These rows were just imported. Check again', 'IMPORT_CONFLICT');
    }
    throw error;
  }
}

/** The caller's own imports, newest first. Imports are personal bank data. */
export async function listImports(scope: HouseholdScope): Promise<ImportBatch[]> {
  await requireMembership(db, scope);
  const rows = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.householdId, scope.householdId),
        eq(importBatches.createdBy, scope.userId),
      ),
    )
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
    .limit(50);
  return toBatches(db, rows);
}

/**
 * Soft deletes every transaction the import created that is still there (edited ones
 * too), each audited like a normal delete, and marks the import undone. Only the person
 * who imported can undo; undoing twice changes nothing.
 */
export async function undoImport(scope: HouseholdScope & { importId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    await lockHouseholdShared(tx, scope.householdId);
    await requireMembership(tx, scope);

    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, scope.importId),
          eq(importBatches.householdId, scope.householdId),
          eq(importBatches.createdBy, scope.userId),
        ),
      )
      .for('update');
    if (!batch) throw importNotFound();
    if (batch.undoneAt) return;

    const rows = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.importBatchId, batch.id), isNull(transactions.deletedAt)))
      .orderBy(transactions.id)
      .for('update');
    // One timestamp for the rows and the batch: a row whose deletion matches the undo was
    // deleted by it; an earlier deletion was the person's own choice (see checkImport).
    const at = new Date();
    for (const row of rows) await softDeleteTransaction(tx, scope, row, at);

    await tx.update(importBatches).set({ undoneAt: at }).where(eq(importBatches.id, batch.id));
  });
}
