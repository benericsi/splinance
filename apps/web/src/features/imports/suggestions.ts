import {
  firstMatchingSavingsRule,
  matchKey,
  type Rule,
  ruleMatches,
  type SavingsRule,
  suggestRulePattern,
} from '@splinance/shared';
import type { ReviewRow } from './review';

/** A rule worth offering after an import: what the person did by hand, made automatic. */
export interface RuleSuggestion {
  key: string;
  pattern: string;
  categoryId: string;
  kind: Rule['kind'];
  markShared: boolean;
  /** Imported rows it is based on. */
  count: number;
}

/**
 * Rules for the categories picked by hand in this import: one per merchant (its name
 * without branch or card numbers) whose rows all went to one category. Skipped when an
 * existing rule already covers the text, when rows of one merchant went to different
 * categories (no clear rule), or when there is no merchant name to go by. Shared when every
 * row of the merchant was imported as shared.
 */
export function suggestRules(imported: ReviewRow[], rules: Rule[]): RuleSuggestion[] {
  const groups = new Map<string, { pattern: string; kind: Rule['kind']; rows: ReviewRow[] }>();
  for (const review of imported) {
    const { counterparty, kind } = review.row;
    // A rule did it already, or nothing to learn from.
    if (
      review.destination !== 'transaction' ||
      !review.categoryId ||
      review.rule?.categoryId === review.categoryId ||
      !counterparty
    ) {
      continue;
    }
    const pattern = suggestRulePattern(counterparty);
    const key = `${kind}:${matchKey(pattern)}`;
    const group = groups.get(key) ?? { pattern, kind, rows: [] };
    group.rows.push(review);
    groups.set(key, group);
  }

  const suggestions: RuleSuggestion[] = [];
  for (const [key, { pattern, kind, rows }] of groups) {
    const categoryIds = new Set(rows.map((review) => review.categoryId));
    const [categoryId] = categoryIds;
    if (categoryIds.size !== 1 || !categoryId) continue;
    const covered = rules.some(
      (rule) =>
        rule.kind === kind &&
        (matchKey(rule.pattern) === matchKey(pattern) ||
          ruleMatches(rule, { kind, counterparty: pattern, description: '' })),
    );
    if (covered) continue;
    suggestions.push({
      key,
      pattern,
      categoryId,
      kind,
      markShared: rows.every((review) => review.visibility === 'shared'),
      count: rows.length,
    });
  }
  return suggestions;
}

/** A savings rule worth offering after an import: a pocket sent to a goal by hand. */
export interface SavingsRuleSuggestion {
  key: string;
  pattern: string;
  goalId: string;
  count: number;
}

/**
 * Savings rules for the goals picked by hand in this import: one per pocket (the bank's
 * name for it without numbers, else the description) whose rows all went to one goal.
 * Skipped when one of the viewer's savings rules already covers the text.
 */
export function suggestSavingsRules(
  imported: ReviewRow[],
  rules: Pick<SavingsRule, 'pattern'>[],
): SavingsRuleSuggestion[] {
  const groups = new Map<string, { pattern: string; rows: ReviewRow[] }>();
  for (const review of imported) {
    if (review.destination !== 'savings' || !review.goalId) continue;
    if (review.savingsRule?.goalId === review.goalId) continue;
    const text = review.row.counterparty ?? review.row.description;
    if (!text.trim()) continue;
    const pattern = suggestRulePattern(text);
    const key = `savings:${matchKey(pattern)}`;
    const group = groups.get(key) ?? { pattern, rows: [] };
    group.rows.push(review);
    groups.set(key, group);
  }

  const suggestions: SavingsRuleSuggestion[] = [];
  for (const [key, { pattern, rows }] of groups) {
    const goalIds = new Set(rows.map((review) => review.goalId));
    const [goalId] = goalIds;
    if (goalIds.size !== 1 || !goalId || pattern.length < 2) continue;
    if (firstMatchingSavingsRule(rules, { counterparty: pattern, description: '' })) continue;
    suggestions.push({ key, pattern, goalId, count: rows.length });
  }
  return suggestions;
}
