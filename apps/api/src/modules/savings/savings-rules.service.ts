import {
  matchKey,
  type SavingsRule,
  type SavingsRuleInput,
  type UpdateSavingsRuleInput,
} from '@splinance/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, type Db } from '../../db/client';
import { isUniqueViolation } from '../../db/errors';
import { savingsGoals, savingsRules, type SavingsRuleRow } from '../../db/schema';
import { HttpError } from '../../lib/http-error';
import { requireMembership } from '../households/households.service';
import { goalVisibleTo, type HouseholdScope } from './savings.service';

export const savingsRuleNotFound = () =>
  new HttpError(404, 'Savings rule not found', 'SAVINGS_RULE_NOT_FOUND');

const patternTaken = () =>
  new HttpError(409, 'You have a rule for this text already', 'SAVINGS_RULE_PATTERN_TAKEN');

/** Also for a goal the caller cannot see: the answer must not tell the two apart. */
const invalidGoal = () => new HttpError(400, 'Choose an open goal', 'INVALID_GOAL');

const PATTERN_UNIQUE = 'savings_rules_user_pattern_unique';

export interface SavingsRuleScope extends HouseholdScope {
  ruleId: string;
}

function toRule(row: SavingsRuleRow): SavingsRule {
  return { id: row.id, pattern: row.pattern, goalId: row.goalId };
}

async function mapPatternTaken<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (isUniqueViolation(err, PATTERN_UNIQUE)) throw patternTaken();
    throw err;
  }
}

/** A goal a rule may point at: open, in this household, and one the caller can see. */
async function openGoal(executor: Db, scope: HouseholdScope, goalId: string): Promise<string> {
  const [row] = await executor
    .select({ id: savingsGoals.id })
    .from(savingsGoals)
    .where(
      and(
        eq(savingsGoals.id, goalId),
        eq(savingsGoals.householdId, scope.householdId),
        goalVisibleTo(scope.userId),
        isNull(savingsGoals.archivedAt),
      ),
    );
  if (!row) throw invalidGoal();
  return row.id;
}

/** The caller's own rule; anyone else's is not found. */
async function findRule(executor: Db, scope: SavingsRuleScope): Promise<SavingsRuleRow> {
  const [row] = await executor
    .select()
    .from(savingsRules)
    .where(
      and(
        eq(savingsRules.id, scope.ruleId),
        eq(savingsRules.householdId, scope.householdId),
        eq(savingsRules.userId, scope.userId),
      ),
    );
  if (!row) throw savingsRuleNotFound();
  return row;
}

/**
 * The caller's rules, oldest first. Rules are personal: nobody else sees them, owners
 * included, since they name the caller's pockets and may point at a private goal.
 */
export async function listSavingsRules(scope: HouseholdScope): Promise<SavingsRule[]> {
  await requireMembership(db, scope);
  const rows = await db
    .select()
    .from(savingsRules)
    .where(
      and(eq(savingsRules.householdId, scope.householdId), eq(savingsRules.userId, scope.userId)),
    )
    .orderBy(asc(savingsRules.id));
  return rows.map(toRule);
}

export async function createSavingsRule(
  scope: HouseholdScope,
  input: SavingsRuleInput,
): Promise<SavingsRule> {
  await requireMembership(db, scope);
  const goalId = await openGoal(db, scope, input.goalId);
  const [row] = await mapPatternTaken(
    db
      .insert(savingsRules)
      .values({
        householdId: scope.householdId,
        userId: scope.userId,
        goalId,
        pattern: input.pattern,
        patternKey: matchKey(input.pattern),
      })
      .returning(),
  );
  if (!row) throw new Error('Savings rule insert returned no row');
  return toRule(row);
}

export async function updateSavingsRule(
  scope: SavingsRuleScope,
  input: UpdateSavingsRuleInput,
): Promise<SavingsRule> {
  await requireMembership(db, scope);
  const existing = await findRule(db, scope);
  const goalId = input.goalId === undefined ? undefined : await openGoal(db, scope, input.goalId);
  const [row] = await mapPatternTaken(
    db
      .update(savingsRules)
      .set({
        ...(input.pattern !== undefined && {
          pattern: input.pattern,
          patternKey: matchKey(input.pattern),
        }),
        ...(goalId !== undefined && { goalId }),
      })
      .where(eq(savingsRules.id, existing.id))
      .returning(),
  );
  if (!row) throw savingsRuleNotFound();
  return toRule(row);
}

/** A hard delete: rules are settings, and the entries they helped make stay. */
export async function deleteSavingsRule(scope: SavingsRuleScope): Promise<void> {
  await requireMembership(db, scope);
  const existing = await findRule(db, scope);
  await db.delete(savingsRules).where(eq(savingsRules.id, existing.id));
}
