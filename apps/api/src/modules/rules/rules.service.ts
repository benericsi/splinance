import {
  matchKey,
  type Rule,
  type RuleInput,
  ruleMatches,
  type UpdateRuleInput,
} from '@splinance/shared';
import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { mapUniqueViolation } from '../../db/errors';
import { categoryRules, type CategoryRuleRow, transactions } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import {
  type HouseholdScope,
  inHouseholdWrite,
  requireMembership,
} from '../households/households.service';
import { setTransactionCategory, visibleTo } from '../transactions/transactions.service';
import { usableCategory } from '../categories/categories.service';

export const ruleNotFound = () => new HttpError(404, 'Rule not found', 'RULE_NOT_FOUND');

const patternTaken = () =>
  new HttpError(409, 'There is a rule for this text already', 'RULE_PATTERN_TAKEN');

const PATTERN_UNIQUE = 'category_rules_household_kind_pattern_unique';
const CREATE_RULE_LOCK = 'splinance:create-rule';

export interface RuleScope extends HouseholdScope {
  ruleId: string;
}

function toRule(row: CategoryRuleRow): Rule {
  return {
    id: row.id,
    pattern: row.pattern,
    categoryId: row.categoryId,
    kind: row.kind,
    markShared: row.markShared,
    position: row.position,
  };
}

const mapPatternTaken = <T>(write: Promise<T>) =>
  mapUniqueViolation(write, PATTERN_UNIQUE, patternTaken);

async function findRule(executor: Db, { householdId, ruleId }: RuleScope) {
  const [row] = await executor
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.householdId, householdId)));
  if (!row) throw ruleNotFound();
  return row;
}

/** Every member sees and manages the household's rules, in the order they apply. */
export async function listRules(scope: HouseholdScope): Promise<Rule[]> {
  await requireMembership(db, scope);
  const rows = await db
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.householdId, scope.householdId))
    .orderBy(asc(categoryRules.position), asc(categoryRules.id));
  return rows.map(toRule);
}

/**
 * New rules go last, so they never override what was there. The position is read and used
 * under a per-household advisory lock: locking the existing rules would not do, since with
 * none there is nothing to lock, and two rules created together would share a position.
 */
export async function createRule(scope: HouseholdScope, input: RuleInput): Promise<Rule> {
  return db.transaction(async (tx) => {
    await requireMembership(tx, scope);
    const category = await usableCategory(tx, scope.householdId, input.categoryId);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${CREATE_RULE_LOCK}:${scope.householdId}`}))`,
    );
    const [last] = await tx
      .select({ position: max(categoryRules.position) })
      .from(categoryRules)
      .where(eq(categoryRules.householdId, scope.householdId));

    const [row] = await mapPatternTaken(
      tx
        .insert(categoryRules)
        .values({
          householdId: scope.householdId,
          pattern: input.pattern,
          patternKey: matchKey(input.pattern),
          categoryId: category.id,
          kind: category.kind,
          markShared: input.markShared,
          position: last?.position === null || last === undefined ? 0 : last.position + 1,
          createdBy: scope.userId,
        })
        .returning(),
    );
    if (!row) throw new Error('Rule insert returned no row');
    return toRule(row);
  });
}

export async function updateRule(scope: RuleScope, input: UpdateRuleInput): Promise<Rule> {
  await requireMembership(db, scope);
  const existing = await findRule(db, scope);
  const category =
    input.categoryId === undefined
      ? undefined
      : await usableCategory(db, scope.householdId, input.categoryId);

  const [row] = await mapPatternTaken(
    db
      .update(categoryRules)
      .set({
        ...(input.pattern !== undefined && {
          pattern: input.pattern,
          patternKey: matchKey(input.pattern),
        }),
        ...(category && { categoryId: category.id, kind: category.kind }),
        ...(input.markShared !== undefined && { markShared: input.markShared }),
      })
      .where(eq(categoryRules.id, existing.id))
      .returning(),
  );
  if (!row) throw ruleNotFound();
  return toRule(row);
}

/** A hard delete: rules are settings, and categorized transactions keep their category. */
export async function deleteRule(scope: RuleScope): Promise<void> {
  await requireMembership(db, scope);
  const existing = await findRule(db, scope);
  await db.delete(categoryRules).where(eq(categoryRules.id, existing.id));
}

/** Sets the order to `ruleIds`, which must name every rule of the household exactly once. */
export async function reorderRules(scope: HouseholdScope, ruleIds: string[]): Promise<Rule[]> {
  return db.transaction(async (tx) => {
    await requireMembership(tx, scope);
    const rows = await tx
      .select({ id: categoryRules.id })
      .from(categoryRules)
      .where(eq(categoryRules.householdId, scope.householdId))
      .for('update');
    const known = new Set(rows.map((row) => row.id));
    if (
      ruleIds.length !== known.size ||
      new Set(ruleIds).size !== ruleIds.length ||
      !ruleIds.every((id) => known.has(id))
    ) {
      throw new HttpError(400, 'Send every rule exactly once', 'RULE_ORDER_MISMATCH');
    }
    for (const [position, id] of ruleIds.entries()) {
      await tx.update(categoryRules).set({ position }).where(eq(categoryRules.id, id));
    }
    const ordered = await tx
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.householdId, scope.householdId))
      .orderBy(asc(categoryRules.position), asc(categoryRules.id));
    return ordered.map(toRule);
  });
}

/** The newest uncategorized transactions a rule looks at: plenty for a person, bounded work. */
export const RULE_SCAN_LIMIT = 5_000;

/** What the rule may categorize: visible to the caller, not deleted, no category, its kind. */
const candidates = (scope: HouseholdScope, rule: CategoryRuleRow) =>
  and(
    eq(transactions.householdId, scope.householdId),
    isNull(transactions.deletedAt),
    isNull(transactions.categoryId),
    eq(transactions.kind, rule.kind),
    visibleTo(scope.userId),
  );

/**
 * Ids of the earlier transactions the rule would categorize: candidates matching its text,
 * among the newest RULE_SCAN_LIMIT. Matching normalizes text in JS (`matchKey`: NFD,
 * diacritics stripped), which SQL cannot repeat exactly, so only the text columns are read,
 * without a lock.
 */
async function uncategorizedMatchIds(
  executor: Db,
  scope: HouseholdScope,
  rule: CategoryRuleRow,
): Promise<string[]> {
  const rows = await executor
    .select({
      id: transactions.id,
      kind: transactions.kind,
      description: transactions.description,
      counterparty: transactions.counterparty,
    })
    .from(transactions)
    .where(candidates(scope, rule))
    .orderBy(desc(transactions.occurredOn), desc(transactions.id))
    .limit(RULE_SCAN_LIMIT);
  return rows.filter((row) => ruleMatches(rule, row)).map((row) => row.id);
}

export async function countRuleMatches(scope: RuleScope): Promise<number> {
  await requireMembership(db, scope);
  const rule = await findRule(db, scope);
  return (await uncategorizedMatchIds(db, scope, rule)).length;
}

/**
 * Categorizes the earlier matches, each audited as an update. Only the category changes,
 * never who it is for: that would move balances behind people's backs.
 */
export async function applyRule(scope: RuleScope): Promise<number> {
  return inHouseholdWrite(scope, async (tx) => {
    const rule = await findRule(tx, scope);
    await usableCategory(tx, scope.householdId, rule.categoryId);

    // Then only the matches are locked (in id order), and checked again under the lock: one
    // edited or categorized in between is left alone.
    const ids = await uncategorizedMatchIds(tx, scope, rule);
    if (ids.length === 0) return 0;
    const locked = await tx
      .select()
      .from(transactions)
      .where(and(inArray(transactions.id, ids), candidates(scope, rule)))
      .orderBy(asc(transactions.id))
      .for('update');
    const matches = locked.filter((row) => ruleMatches(rule, row));
    for (const row of matches) await setTransactionCategory(tx, scope, row, rule.categoryId);
    return matches.length;
  });
}
