import {
  matchKey,
  type Rule,
  type RuleInput,
  ruleMatches,
  type UpdateRuleInput,
} from '@splinance/shared';
import { and, asc, eq, isNull, max } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import { categories, categoryRules, type CategoryRuleRow, transactions } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { lockHouseholdShared, requireMembership } from '../households/households.service';
import {
  type HouseholdScope,
  setTransactionCategory,
  visibleTo,
} from '../transactions/transactions.service';

export const ruleNotFound = () => new HttpError(404, 'Rule not found', 'RULE_NOT_FOUND');

const patternTaken = () =>
  new HttpError(409, 'There is a rule for this text already', 'RULE_PATTERN_TAKEN');

const invalidCategory = () => new HttpError(400, 'Choose an active category', 'INVALID_CATEGORY');

const PATTERN_UNIQUE = 'category_rules_household_kind_pattern_unique';

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

async function mapPatternTaken<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (isUniqueViolation(err, PATTERN_UNIQUE)) throw patternTaken();
    throw err;
  }
}

/** The category a rule may point at: active and in this household. Its kind comes along. */
async function activeCategory(executor: Db, householdId: string, categoryId: string) {
  const [row] = await executor
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.householdId, householdId),
        isNull(categories.archivedAt),
      ),
    );
  if (!row) throw invalidCategory();
  return row;
}

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

/** New rules go last, so they never override what was there. */
export async function createRule(scope: HouseholdScope, input: RuleInput): Promise<Rule> {
  await requireMembership(db, scope);
  const category = await activeCategory(db, scope.householdId, input.categoryId);
  const [last] = await db
    .select({ position: max(categoryRules.position) })
    .from(categoryRules)
    .where(eq(categoryRules.householdId, scope.householdId));

  const [row] = await mapPatternTaken(
    db
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
}

export async function updateRule(scope: RuleScope, input: UpdateRuleInput): Promise<Rule> {
  await requireMembership(db, scope);
  const existing = await findRule(db, scope);
  const category =
    input.categoryId === undefined
      ? undefined
      : await activeCategory(db, scope.householdId, input.categoryId);

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

/**
 * Earlier transactions the rule would categorize: visible to the caller, not deleted,
 * without a category, of the rule's kind, matching its text.
 */
async function uncategorizedMatches(
  executor: Db,
  scope: HouseholdScope,
  rule: CategoryRuleRow,
  { lock = false } = {},
) {
  const query = executor
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        isNull(transactions.categoryId),
        eq(transactions.kind, rule.kind),
        visibleTo(scope.userId),
      ),
    )
    .orderBy(asc(transactions.id));
  const rows = lock ? await query.for('update') : await query;
  return rows.filter((row) => ruleMatches(rule, row));
}

export async function countRuleMatches(scope: RuleScope): Promise<number> {
  await requireMembership(db, scope);
  const rule = await findRule(db, scope);
  return (await uncategorizedMatches(db, scope, rule)).length;
}

/**
 * Categorizes the earlier matches, each audited as an update. Only the category changes,
 * never who it is for: that would move balances behind people's backs.
 */
export async function applyRule(scope: RuleScope): Promise<number> {
  return db.transaction(async (tx) => {
    await lockHouseholdShared(tx, scope.householdId);
    await requireMembership(tx, scope);
    const rule = await findRule(tx, scope);
    await activeCategory(tx, scope.householdId, rule.categoryId);

    const matches = await uncategorizedMatches(tx, scope, rule, { lock: true });
    for (const row of matches) await setTransactionCategory(tx, scope, row, rule.categoryId);
    return matches.length;
  });
}
