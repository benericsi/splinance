import { matchKey, type Rule, ruleMatches, suggestRulePattern } from '@splinance/shared';
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
    if (!review.categoryId || review.rule?.categoryId === review.categoryId || !counterparty) {
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
