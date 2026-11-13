import {
  type ImportBatch,
  type ImportCheckInput,
  type ImportCheckResult,
  type ImportInput,
  type ImportResponse,
  type ImportSavingsRow,
  type ImportTransactionRow,
  savingsEntryAmount,
} from '@splinance/shared';
import { and, between, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import {
  householdMembers,
  type ImportBatchRow,
  importBatches,
  savingsEntries,
  savingsGoals,
  transactions,
  users,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { lockHouseholdShared, requireMembership } from '../households/households.service';
import {
  goalNotFound,
  insertEntry,
  lockGoals,
  undoImportedEntries,
} from '../savings/savings.service';
import {
  activeMemberIds,
  type HouseholdScope,
  insertTransaction,
  softDeleteTransaction,
} from '../transactions/transactions.service';
import { collectingActivity, recordImportActivity } from '../notifications/activity';

export const importNotFound = () => new HttpError(404, 'Import not found', 'IMPORT_NOT_FOUND');

/** Hand-entered records this many days apart still count as possible duplicates. */
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
  // Every entry the import created, removed ones too (like `row_count`).
  const savings = await executor
    .select({ batchId: savingsEntries.importBatchId, count: count() })
    .from(savingsEntries)
    .where(
      inArray(
        savingsEntries.importBatchId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(savingsEntries.importBatchId);
  const savingsOf = new Map(savings.map((row) => [row.batchId, row.count]));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    fileName: row.fileName,
    rowCount: row.rowCount,
    savingsCount: savingsOf.get(row.id) ?? 0,
    createdBy: { userId: row.createdBy, displayName: nameOf.get(row.createdBy) ?? '' },
    createdAt: row.createdAt.toISOString(),
    undoneAt: row.undoneAt?.toISOString() ?? null,
  }));
}

/** A transaction or savings entry the caller imported before. */
interface ImportedRecord {
  id: string;
  description: string;
  occurredOn: string;
  fingerprint: string | null;
  deletedAt: Date | null;
  undoneAt: Date | null;
  goalId: string | null;
}

/** A transaction or savings entry the caller entered by hand, as a bank row would show it. */
interface Candidate {
  id: string;
  kind: 'expense' | 'income';
  amount: number;
  description: string;
  occurredOn: string;
  goalId: string | null;
}

/**
 * How each row relates to what is there already, from the caller's side: what they
 * imported (transactions and savings entries) and what they entered by hand. Fingerprints
 * are per person: the same bank row imported by someone else is theirs, not a duplicate.
 */
export async function checkImport(
  scope: HouseholdScope,
  input: ImportCheckInput,
): Promise<ImportCheckResult[]> {
  await requireMembership(db, scope);
  const fingerprints = [...new Set(input.rows.map((row) => row.fingerprint))];

  const importedTransactions = await db
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
  // The caller's own entries are always in goals they can see, so the names are theirs.
  const importedEntries = await db
    .select({
      id: savingsEntries.id,
      description: savingsGoals.name,
      occurredOn: savingsEntries.entryOn,
      fingerprint: savingsEntries.importFingerprint,
      deletedAt: savingsEntries.deletedAt,
      undoneAt: importBatches.undoneAt,
      goalId: savingsEntries.goalId,
    })
    .from(savingsEntries)
    .innerJoin(importBatches, eq(importBatches.id, savingsEntries.importBatchId))
    .innerJoin(savingsGoals, eq(savingsGoals.id, savingsEntries.goalId))
    .where(
      and(
        eq(savingsEntries.householdId, scope.householdId),
        eq(savingsEntries.userId, scope.userId),
        inArray(savingsEntries.importFingerprint, fingerprints),
      ),
    );

  // A live copy wins over deleted ones; among deleted ones, one removed by undoing its import
  // wins (it says "import again"), a delete of its own otherwise says "not wanted".
  const byUndo = (row: ImportedRecord) =>
    row.deletedAt !== null && row.deletedAt.getTime() === row.undoneAt?.getTime();
  const rank = (row: ImportedRecord) => (!row.deletedAt ? 0 : byUndo(row) ? 1 : 2);
  const byFingerprint = new Map<string, ImportedRecord>();
  const imported: ImportedRecord[] = [
    ...importedTransactions.map((row) => ({ ...row, goalId: null })),
    ...importedEntries,
  ];
  for (const row of imported) {
    const current = row.fingerprint ? byFingerprint.get(row.fingerprint) : undefined;
    if (row.fingerprint && (!current || rank(row) < rank(current))) {
      byFingerprint.set(row.fingerprint, row);
    }
  }

  // Hand-entered transactions the caller paid for (private ones are always theirs) and
  // savings entries they recorded by hand, around the rows' dates and with their amounts.
  const dates = input.rows.map((row) => row.occurredOn).sort();
  const firstDate = dates[0] ?? '2000-01-01';
  const from = shiftDays(firstDate, -DUPLICATE_WINDOW_DAYS);
  const to = shiftDays(dates.at(-1) ?? firstDate, DUPLICATE_WINDOW_DAYS);
  const amounts = [...new Set(input.rows.map((row) => row.amount))];
  const handTransactions = await db
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
        inArray(transactions.amount, amounts),
        between(transactions.occurredOn, from, to),
      ),
    )
    .orderBy(transactions.occurredOn, transactions.id);
  const handEntries = await db
    .select({
      id: savingsEntries.id,
      amount: savingsEntries.amount,
      description: savingsGoals.name,
      occurredOn: savingsEntries.entryOn,
      goalId: savingsEntries.goalId,
    })
    .from(savingsEntries)
    .innerJoin(savingsGoals, eq(savingsGoals.id, savingsEntries.goalId))
    .where(
      and(
        eq(savingsEntries.householdId, scope.householdId),
        eq(savingsEntries.userId, scope.userId),
        isNull(savingsEntries.deletedAt),
        isNull(savingsEntries.importFingerprint),
        inArray(savingsEntries.amount, [...amounts, ...amounts.map((amount) => -amount)]),
        between(savingsEntries.entryOn, from, to),
      ),
    )
    .orderBy(savingsEntries.entryOn, savingsEntries.id);
  // Transactions first, so on a tie the transaction is the match. An entry looks like a
  // row of its direction: money put into a goal left the account.
  const candidates: Candidate[] = [
    ...handTransactions.map((row) => ({ ...row, goalId: null })),
    ...handEntries.map((row): Candidate => ({
      ...row,
      kind: row.amount > 0 ? 'expense' : 'income',
      amount: Math.abs(row.amount),
    })),
  ];
  const used = new Set<string>();

  return input.rows.map((row) => {
    const known = byFingerprint.get(row.fingerprint);
    if (known) {
      return {
        fingerprint: row.fingerprint,
        status: !known.deletedAt ? 'imported' : byUndo(known) ? 'undone' : 'deleted',
        match: {
          id: known.id,
          description: known.description,
          occurredOn: known.occurredOn,
          goalId: known.goalId,
        },
      };
    }

    // The closest unused hand-entered record of the same kind and amount.
    let best: Candidate | undefined;
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
      match: {
        id: best.id,
        description: best.description,
        occurredOn: best.occurredOn,
        goalId: best.goalId,
      },
    };
  });
}

type IndexedRow<T> = { row: T; index: number };

const isSavingsRow = (
  entry: IndexedRow<ImportInput['rows'][number]>,
): entry is IndexedRow<ImportSavingsRow> => 'savings' in entry.row;

/** Runs one row's write; a refusal fails the import naming the row (1-based). */
async function forRow<T>(index: number, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) {
      const row = index + 1;
      throw new HttpError(error.status, `Row ${String(row)}: ${error.message}`, error.code, {
        row,
      });
    }
    throw error;
  }
}

/** The caller's live imported fingerprints among these, as transactions or entries. */
async function liveFingerprints(
  tx: Db,
  scope: HouseholdScope,
  fingerprints: string[],
): Promise<Set<string | null>> {
  const fromTransactions = await tx
    .select({ fingerprint: transactions.importFingerprint })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.createdBy, scope.userId),
        isNull(transactions.deletedAt),
        isNotNull(transactions.importFingerprint),
        inArray(transactions.importFingerprint, fingerprints),
      ),
    );
  const fromEntries = await tx
    .select({ fingerprint: savingsEntries.importFingerprint })
    .from(savingsEntries)
    .where(
      and(
        eq(savingsEntries.householdId, scope.householdId),
        eq(savingsEntries.userId, scope.userId),
        isNull(savingsEntries.deletedAt),
        isNotNull(savingsEntries.importFingerprint),
        inArray(savingsEntries.importFingerprint, fingerprints),
      ),
    );
  return new Set([...fromTransactions, ...fromEntries].map((row) => row.fingerprint));
}

/**
 * Creates the batch, its transactions and its savings entries in one database transaction.
 * Rows the caller already has (as either, imported in the meantime, or twice in this
 * request) are skipped and counted; a row the transaction or savings rules refuse fails
 * the whole import, naming the row.
 */
export async function createImport(
  scope: HouseholdScope,
  input: ImportInput,
): Promise<ImportResponse> {
  try {
    return await db.transaction(async (tx) => {
      await lockHouseholdShared(tx, scope.householdId);
      const { household } = await requireMembership(tx, scope);
      // One import at a time per person and household: a bank row can become a transaction
      // or a savings entry, two tables no unique index spans, so two imports of the same
      // row at once could otherwise make one of each. `FOR NO KEY UPDATE` does not wait on
      // the foreign key checks of other writes.
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

      const taken = await liveFingerprints(
        tx,
        scope,
        input.rows.map((row) => row.fingerprint),
      );
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
      const savingsRows = rows.filter(isSavingsRow);
      const transactionRows = rows.filter(
        (entry): entry is IndexedRow<ImportTransactionRow> => !isSavingsRow(entry),
      );

      const [batch] = await tx
        .insert(importBatches)
        .values({
          householdId: scope.householdId,
          createdBy: scope.userId,
          source: input.source,
          fileName: input.fileName || null,
          rowCount: transactionRows.length,
        })
        .returning();
      if (!batch) throw new Error('Import batch insert returned no row');

      const allowed = await activeMemberIds(tx, scope.householdId);
      // One notification per person the import involves, not one per row.
      const { people } = await collectingActivity(async () => {
        for (const { row, index } of transactionRows) {
          await forRow(index, () =>
            insertTransaction(tx, scope, household, row.transaction, allowed, {
              importBatchId: batch.id,
              importFingerprint: row.fingerprint,
              counterparty: row.counterparty || null,
            }),
          );
        }
      });
      await recordImportActivity(tx, scope, batch.id, 'create', people);

      // Entries of the caller, in goals they can see, locked like a single entry's goal.
      // Money going in comes first: the goal must hold the money once the file is in, as it
      // must for one entry at a time, so a file listing a withdrawal before the deposit it
      // takes from still imports.
      const goals = await lockGoals(
        tx,
        scope,
        savingsRows.map(({ row }) => row.savings.goalId),
      );
      const depositsFirst = [...savingsRows].sort(
        (a, b) =>
          Number(savingsEntryAmount(a.row.savings) < 0) -
          Number(savingsEntryAmount(b.row.savings) < 0),
      );
      for (const { row, index } of depositsFirst) {
        await forRow(index, async () => {
          const goal = goals.get(row.savings.goalId);
          if (!goal) throw goalNotFound();
          const { entryOn, note } = row.savings;
          await insertEntry(
            tx,
            scope,
            goal,
            { amount: savingsEntryAmount(row.savings), entryOn, note },
            { importBatchId: batch.id, importFingerprint: row.fingerprint },
          );
        });
      }

      const [created] = await toBatches(tx, [batch]);
      if (!created) throw new Error('toBatches returned nothing');
      return { batch: created, skipped: input.rows.length - rows.length };
    });
  } catch (error) {
    // Two imports of the same rows at once: the second one lost the race.
    if (
      isUniqueViolation(error, 'transactions_import_fingerprint_unique') ||
      isUniqueViolation(error, 'savings_entries_import_fingerprint_unique')
    ) {
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
 * too), each audited like a normal delete, and its live savings entries, and marks the
 * import undone. Refused as a whole (409 `INSUFFICIENT_SAVINGS`) when removing the entries
 * would take a goal below zero. Only the person who imported can undo; undoing twice
 * changes nothing.
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
    // One timestamp for the rows, the entries and the batch: a row whose deletion matches the
    // undo was deleted by it; an earlier deletion was the person's own choice (checkImport).
    const at = new Date();
    const { people } = await collectingActivity(async () => {
      for (const row of rows) await softDeleteTransaction(tx, scope, row, at);
    });
    await recordImportActivity(tx, scope, batch.id, 'undo', people);
    await undoImportedEntries(tx, scope, batch.id, at);

    await tx.update(importBatches).set({ undoneAt: at }).where(eq(importBatches.id, batch.id));
  });
}
