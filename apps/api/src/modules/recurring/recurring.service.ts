import {
  assignPayments,
  type DetectedSeries,
  detectRecurring,
  type DismissedRecurring,
  matchKey,
  monthlyAmount,
  nextDueOn,
  type RecurringList,
  type RecurringPayment,
  type RecurringPreviewInput,
  type RecurringPreviewResponse,
  type RecurringRow,
  type RecurringScope,
  type RecurringSeries,
  type RecurringSeriesInput,
  type RecurringSuggestion,
  type RecurringSuggestionDecision,
  seriesCovers,
  type SeriesMatcher,
  seriesPayments,
  type UpdateRecurringSeriesInput,
} from '@splinance/shared';
import { and, count, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import {
  categories,
  notifications,
  recurringSeries,
  type RecurringSeriesRow,
  transactionSplits,
  transactions,
} from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { budapestToday } from '../../lib/today';
import { requireMembership } from '../households/households.service';
import { type HouseholdScope, visibleTo } from '../transactions/transactions.service';

export const seriesNotFound = () =>
  new HttpError(404, 'Recurring payment not found', 'SERIES_NOT_FOUND');

const suggestionNotFound = () =>
  new HttpError(404, 'This suggestion is gone', 'SUGGESTION_NOT_FOUND');

const patternTaken = () =>
  new HttpError(409, 'A recurring payment matches this text already', 'SERIES_PATTERN_TAKEN');

const invalidCategory = () =>
  new HttpError(400, 'Choose an active expense category', 'INVALID_CATEGORY');

const PATTERN_UNIQUE = 'recurring_series_pattern_unique';

/** How far back payments and suggestions are looked for: a year plus a yearly renewal's slack. */
export const SCAN_DAYS = 400;
/** Upper bound on transactions read per request (a household imports a few hundred a month). */
const MAX_ROWS = 20_000;
/** Live series and dismissals per household. */
export const MAX_SERIES = 300;
const MAX_SUGGESTIONS = 100;
const LISTED_PAYMENTS = 12;

export interface SeriesScope extends HouseholdScope {
  seriesId: string;
}

interface Options {
  /** `YYYY-MM-DD`; Budapest today by default (tests pin it). */
  today?: string;
}

type Row = RecurringRow & { importBatchId: string | null };

const scopeOf = (row: Pick<RecurringSeriesRow, 'userId'>): RecurringScope =>
  row.userId === null ? 'shared' : 'private';

const ownerFor = (scope: RecurringScope, userId: string) => (scope === 'private' ? userId : null);

function minusDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function mapPatternTaken<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (isUniqueViolation(err, PATTERN_UNIQUE)) throw patternTaken();
    throw err;
  }
}

/** The expense transactions the caller can see from the last `SCAN_DAYS`, newest first. */
async function visibleExpenses(executor: Db, scope: HouseholdScope, today: string) {
  const rows = await executor
    .select({
      id: transactions.id,
      kind: transactions.kind,
      visibility: transactions.visibility,
      createdBy: transactions.createdBy,
      amount: transactions.amount,
      occurredOn: transactions.occurredOn,
      counterparty: transactions.counterparty,
      description: transactions.description,
      categoryId: transactions.categoryId,
      importBatchId: transactions.importBatchId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.kind, 'expense'),
        isNull(transactions.deletedAt),
        gte(transactions.occurredOn, minusDays(today, SCAN_DAYS)),
        visibleTo(scope.userId),
      ),
    )
    .orderBy(desc(transactions.occurredOn), desc(transactions.id))
    .limit(MAX_ROWS);
  return rows satisfies Row[];
}

/** The household's live series and dismissals the caller may see: shared ones and their own. */
async function visibleSeriesRows(executor: Db, scope: HouseholdScope) {
  return executor
    .select()
    .from(recurringSeries)
    .where(
      and(
        eq(recurringSeries.householdId, scope.householdId),
        isNull(recurringSeries.archivedAt),
        or(isNull(recurringSeries.userId), eq(recurringSeries.userId, scope.userId)),
      ),
    )
    .orderBy(recurringSeries.createdAt, recurringSeries.id);
}

const toMatcher = (row: RecurringSeriesRow): SeriesMatcher => ({
  id: row.id,
  kind: row.kind,
  ownerId: row.userId,
  pattern: row.pattern,
  amount: row.amount ?? 1,
  amountVaries: row.amountVaries,
  startsOn: row.startsOn,
});

/** What the caller sees right now: their series with payments, the suggestions, the dismissals. */
interface Computed {
  rows: RecurringSeriesRow[];
  payments: Map<string, Row[]>;
  suggestions: DetectedSeries[];
}

/**
 * Matches the caller's visible transactions to series and finds suggestions in the rest.
 * Shared series go first, over every row: they only ever take shared transactions, which
 * every member sees, so a shared series has the same payments for everyone. Private series
 * then take from what is left. Suggestions come from what no series covers, minus the
 * dismissed ones (same scope and key).
 */
async function compute(executor: Db, scope: HouseholdScope, today: string): Promise<Computed> {
  const [seriesRows, expenses] = await Promise.all([
    visibleSeriesRows(executor, scope),
    visibleExpenses(executor, scope, today),
  ]);
  const active = seriesRows.filter((row) => row.status === 'active');
  const shared = assignPayments(
    active.filter((row) => row.userId === null).map(toMatcher),
    expenses,
  );
  const own = assignPayments(
    active.filter((row) => row.userId !== null).map(toMatcher),
    shared.unowned,
  );
  const payments = new Map([...shared.payments, ...own.payments]);

  const dismissed = new Set(
    seriesRows
      .filter((row) => row.status === 'dismissed')
      .map((row) => `${scopeOf(row)}:${row.patternKey}`),
  );
  const suggestions = detectRecurring(own.unowned, { today })
    .filter((found) => !dismissed.has(`${found.scope}:${found.key}`))
    .slice(0, MAX_SUGGESTIONS);
  return { rows: seriesRows, payments, suggestions };
}

const toPayment = (row: Row): RecurringPayment => ({
  transactionId: row.id,
  occurredOn: row.occurredOn,
  amount: row.amount,
  imported: row.importBatchId !== null,
});

/** The caller's part of each transaction (shared ones only). */
export async function sharesOf(executor: Db, userId: string, transactionIds: string[]) {
  if (transactionIds.length === 0) return new Map<string, number>();
  const rows = await executor
    .select({ transactionId: transactionSplits.transactionId, amount: transactionSplits.amount })
    .from(transactionSplits)
    .where(
      and(
        inArray(transactionSplits.transactionId, transactionIds),
        eq(transactionSplits.userId, userId),
      ),
    );
  return new Map(rows.map((row) => [row.transactionId, row.amount]));
}

function toSeries(
  row: RecurringSeriesRow,
  payments: Row[],
  shares: Map<string, number>,
): RecurringSeries {
  const { name, cadence, amount, anchorOn } = row;
  if (
    row.status !== 'active' ||
    name === null ||
    cadence === null ||
    amount === null ||
    !anchorOn
  ) {
    throw new Error(`Recurring series ${row.id} is not an active series`);
  }
  const [latest, previous] = payments;
  const latestAmount = latest?.amount ?? amount;
  return {
    id: row.id,
    source: row.source,
    createdBy: row.createdBy,
    name,
    pattern: row.pattern,
    cadence,
    amount,
    amountVaries: row.amountVaries,
    anchorOn,
    startsOn: row.startsOn,
    categoryId: row.categoryId,
    scope: scopeOf(row),
    remind: row.remind,
    payments: payments.slice(0, LISTED_PAYMENTS).map(toPayment),
    paymentCount: payments.length,
    lastPaidOn: latest?.occurredOn ?? null,
    latestAmount,
    previousAmount: previous?.amount ?? null,
    share: latest?.visibility === 'shared' ? (shares.get(latest.id) ?? 0) : null,
    monthlyAmount: monthlyAmount(latestAmount, cadence),
  };
}

const toSuggestion = (found: DetectedSeries): RecurringSuggestion => ({
  key: found.key,
  scope: found.scope,
  cadence: found.cadence,
  amount: found.amount,
  previousAmount: found.previousAmount,
  amountVaries: found.amountVaries,
  firstOn: found.firstOn,
  lastOn: found.lastOn,
  occurrences: found.occurrences,
  description: found.description,
  categoryId: found.categoryId,
  monthlyAmount: found.monthlyAmount,
  transactionIds: found.transactionIds,
});

async function buildSeriesList(
  executor: Db,
  scope: HouseholdScope,
  computed: Computed,
  today: string,
): Promise<RecurringSeries[]> {
  const active = computed.rows.filter((row) => row.status === 'active');
  const latestIds = active.flatMap((row) => computed.payments.get(row.id)?.[0]?.id ?? []);
  const shares = await sharesOf(executor, scope.userId, latestIds);
  return active
    .map((row) => toSeries(row, computed.payments.get(row.id) ?? [], shares))
    .map((series) => ({ series, next: nextDueOn(series, series.lastPaidOn, today) }))
    .sort((a, b) => a.next.localeCompare(b.next) || a.series.name.localeCompare(b.series.name))
    .map(({ series }) => series);
}

/**
 * A member's series with their payments, soonest first, for the notification sync. No
 * membership check: the caller decides who is a member.
 */
export async function seriesForMember(
  executor: Db,
  scope: HouseholdScope,
  today: string,
): Promise<RecurringSeries[]> {
  return buildSeriesList(executor, scope, await compute(executor, scope, today), today);
}

/**
 * A member's series, each with every payment found in the scan window (the list keeps only
 * the latest few), for the calendar. No membership check, like `seriesForMember`.
 */
export async function seriesWithPayments(executor: Db, scope: HouseholdScope, today: string) {
  const computed = await compute(executor, scope, today);
  const series = await buildSeriesList(executor, scope, computed, today);
  return series.map((item) => ({ series: item, payments: computed.payments.get(item.id) ?? [] }));
}

/**
 * Everything the recurring page shows for the caller: their series (soonest payment first),
 * suggestions (most expensive per month first) and dismissed suggestions.
 */
export async function listRecurring(
  scope: HouseholdScope,
  { today = budapestToday() }: Options = {},
): Promise<RecurringList> {
  const { household } = await requireMembership(db, scope);
  const computed = await compute(db, scope, today);
  const dismissed: DismissedRecurring[] = computed.rows
    .filter((row) => row.status === 'dismissed')
    .map((row) => ({ id: row.id, pattern: row.pattern, scope: scopeOf(row) }));
  return {
    currency: household.baseCurrency,
    series: await buildSeriesList(db, scope, computed, today),
    suggestions: computed.suggestions.map(toSuggestion),
    dismissed,
  };
}

async function seriesView(scope: HouseholdScope, seriesId: string, today: string) {
  const series = (await buildSeriesList(db, scope, await compute(db, scope, today), today)).find(
    (item) => item.id === seriesId,
  );
  if (!series) throw seriesNotFound();
  return series;
}

/** An active expense category of this household (or none). */
async function checkCategory(executor: Db, householdId: string, categoryId: string | null) {
  if (categoryId === null) return;
  const [row] = await executor
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.householdId, householdId),
        eq(categories.kind, 'expense'),
        isNull(categories.archivedAt),
      ),
    );
  if (!row) throw invalidCategory();
}

async function checkRoom(executor: Db, householdId: string) {
  const [row] = await executor
    .select({ n: count() })
    .from(recurringSeries)
    .where(and(eq(recurringSeries.householdId, householdId), isNull(recurringSeries.archivedAt)));
  if ((row?.n ?? 0) >= MAX_SERIES) {
    throw new HttpError(
      409,
      'This household tracks too many recurring payments',
      'RECURRING_LIMIT',
    );
  }
}

/** Removes a dismissal of this text, so adding or confirming it again takes its place. */
async function dropDismissal(
  executor: Db,
  scope: HouseholdScope,
  recurringScope: RecurringScope,
  patternKey: string,
) {
  const owner = ownerFor(recurringScope, scope.userId);
  await executor
    .delete(recurringSeries)
    .where(
      and(
        eq(recurringSeries.householdId, scope.householdId),
        eq(recurringSeries.status, 'dismissed'),
        eq(recurringSeries.patternKey, patternKey),
        owner === null ? isNull(recurringSeries.userId) : eq(recurringSeries.userId, owner),
        isNull(recurringSeries.archivedAt),
      ),
    );
}

/** Adding a series by hand ("+ Add", "Make recurring"). */
export async function createSeries(
  scope: HouseholdScope,
  input: RecurringSeriesInput,
  { today = budapestToday() }: Options = {},
): Promise<RecurringSeries> {
  const { household } = await requireMembership(db, scope);
  await checkCategory(db, scope.householdId, input.categoryId);
  const patternKey = matchKey(input.pattern);
  const id = await db.transaction(async (tx) => {
    await checkRoom(tx, scope.householdId);
    await dropDismissal(tx, scope, input.scope, patternKey);
    const [row] = await mapPatternTaken(
      tx
        .insert(recurringSeries)
        .values({
          householdId: scope.householdId,
          userId: ownerFor(input.scope, scope.userId),
          status: 'active',
          source: 'manual',
          name: input.name,
          pattern: input.pattern,
          patternKey,
          cadence: input.cadence,
          amount: input.amount,
          amountVaries: input.amountVaries,
          currency: household.baseCurrency,
          anchorOn: input.anchorOn,
          startsOn: input.startsOn,
          categoryId: input.categoryId,
          remind: input.remind,
          createdBy: scope.userId,
        })
        .returning({ id: recurringSeries.id }),
    );
    if (!row) throw new Error('Recurring series insert returned no row');
    return row.id;
  });
  return seriesView(scope, id, today);
}

/**
 * Which of the caller's transactions a pattern would match, while they type it. Counts only
 * what the caller can see (a shared pattern only shared transactions), so it reveals
 * nothing they could not list themselves.
 */
export async function previewSeries(
  scope: HouseholdScope,
  input: RecurringPreviewInput,
  { today = budapestToday() }: Options = {},
): Promise<RecurringPreviewResponse> {
  await requireMembership(db, scope);
  const matcher: SeriesMatcher = {
    id: 'preview',
    kind: 'expense',
    ownerId: ownerFor(input.scope, scope.userId),
    pattern: input.pattern,
    amount: input.amount,
    amountVaries: input.amountVaries,
    startsOn: input.startsOn,
  };
  const expenses = await visibleExpenses(db, scope, today);
  const payments = seriesPayments(
    matcher,
    expenses.filter((row) => seriesCovers(matcher, row)),
  );
  return { matches: payments.length, recent: payments.slice(0, 3).map(toPayment) };
}

async function findSuggestion(
  scope: HouseholdScope,
  decision: RecurringSuggestionDecision,
  today: string,
) {
  const { suggestions } = await compute(db, scope, today);
  const found = suggestions.find((s) => s.scope === decision.scope && s.key === decision.key);
  if (!found) throw suggestionNotFound();
  return found;
}

/** "Confirm" on a suggestion: a series with what detection saw. */
export async function confirmSuggestion(
  scope: HouseholdScope,
  decision: RecurringSuggestionDecision,
  { today = budapestToday() }: Options = {},
): Promise<RecurringSeries> {
  const { household } = await requireMembership(db, scope);
  const found = await findSuggestion(scope, decision, today);
  // The category may have been archived since the payment was categorized.
  const categoryId = await checkCategory(db, scope.householdId, found.categoryId).then(
    () => found.categoryId,
    () => null,
  );
  const id = await db.transaction(async (tx) => {
    await checkRoom(tx, scope.householdId);
    const [row] = await mapPatternTaken(
      tx
        .insert(recurringSeries)
        .values({
          householdId: scope.householdId,
          userId: ownerFor(found.scope, scope.userId),
          status: 'active',
          source: 'detected',
          name: found.description.slice(0, 60).trim() || found.key.slice(0, 60),
          pattern: found.key,
          patternKey: found.key,
          cadence: found.cadence,
          amount: found.amount,
          currency: household.baseCurrency,
          anchorOn: found.lastOn,
          categoryId,
          createdBy: scope.userId,
        })
        .returning({ id: recurringSeries.id }),
    );
    if (!row) throw new Error('Recurring series insert returned no row');
    return row.id;
  });
  return seriesView(scope, id, today);
}

/** "Not recurring": the suggestion stays away until "Show again". */
export async function dismissSuggestion(
  scope: HouseholdScope,
  decision: RecurringSuggestionDecision,
  { today = budapestToday() }: Options = {},
): Promise<void> {
  const { household } = await requireMembership(db, scope);
  const found = await findSuggestion(scope, decision, today);
  await db.transaction(async (tx) => {
    await checkRoom(tx, scope.householdId);
    await tx
      .insert(recurringSeries)
      .values({
        householdId: scope.householdId,
        userId: ownerFor(found.scope, scope.userId),
        status: 'dismissed',
        source: 'detected',
        pattern: found.key,
        patternKey: found.key,
        currency: household.baseCurrency,
        createdBy: scope.userId,
      })
      .onConflictDoNothing();
  });
}

/** A live row the caller may change: shared ones (any member) and their own private ones. */
async function findRow(executor: Db, scope: SeriesScope) {
  const [row] = await executor
    .select()
    .from(recurringSeries)
    .where(
      and(
        eq(recurringSeries.id, scope.seriesId),
        eq(recurringSeries.householdId, scope.householdId),
        isNull(recurringSeries.archivedAt),
        or(isNull(recurringSeries.userId), eq(recurringSeries.userId, scope.userId)),
      ),
    );
  if (!row) throw seriesNotFound();
  return row;
}

export async function updateSeries(
  scope: SeriesScope,
  input: UpdateRecurringSeriesInput,
  { today = budapestToday() }: Options = {},
): Promise<RecurringSeries> {
  await requireMembership(db, scope);
  const existing = await findRow(db, scope);
  if (existing.status !== 'active') throw seriesNotFound();
  if (input.categoryId !== undefined) {
    await checkCategory(db, scope.householdId, input.categoryId);
  }
  const startsOn = input.startsOn === undefined ? existing.startsOn : input.startsOn;
  const anchorOn = input.anchorOn ?? existing.anchorOn;
  if (startsOn !== null && anchorOn !== null && startsOn > anchorOn) {
    throw new HttpError(400, 'The first payment cannot be after this date', 'INVALID_START');
  }
  await mapPatternTaken(
    db
      .update(recurringSeries)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.pattern !== undefined && {
          pattern: input.pattern,
          patternKey: matchKey(input.pattern),
        }),
        ...(input.cadence !== undefined && { cadence: input.cadence }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.amountVaries !== undefined && { amountVaries: input.amountVaries }),
        ...(input.anchorOn !== undefined && { anchorOn: input.anchorOn }),
        ...(input.startsOn !== undefined && { startsOn: input.startsOn }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.remind !== undefined && { remind: input.remind }),
      })
      .where(eq(recurringSeries.id, existing.id)),
  );
  return seriesView(scope, existing.id, today);
}

/**
 * "Stop tracking" a series, or "Show again" for a dismissal. A series that has payments is
 * archived (kept, hidden); one that never matched anything, and a dismissal, are deleted.
 */
export async function deleteSeries(
  scope: SeriesScope,
  { today = budapestToday() }: Options = {},
): Promise<void> {
  await requireMembership(db, scope);
  const existing = await findRow(db, scope);
  const hasPayments =
    existing.status === 'active' &&
    ((await compute(db, scope, today)).payments.get(existing.id)?.length ?? 0) > 0;
  if (hasPayments) {
    await db
      .update(recurringSeries)
      .set({ archivedAt: new Date() })
      .where(eq(recurringSeries.id, existing.id));
  } else {
    await db.transaction(async (tx) => {
      // Its notifications would point at nothing.
      await tx.delete(notifications).where(eq(notifications.subjectId, existing.id));
      await tx.delete(recurringSeries).where(eq(recurringSeries.id, existing.id));
    });
  }
}
