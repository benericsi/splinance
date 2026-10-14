import { z } from 'zod';
import { categoryKindSchema } from './categories';

/**
 * Text as rules compare it: accents and case dropped, runs of spaces collapsed. "TESCO
 * 44049" and "tesco" meet, so do "Gyógyszertár" and "gyogyszertar".
 */
export function matchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const rulePatternSchema = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters')
  .max(60, 'Keep it under 60 characters');

export const ruleInputSchema = z.object({
  pattern: rulePatternSchema,
  categoryId: z.uuid(),
  /** Imported rows it matches start as shared (still changeable in the review). */
  markShared: z.boolean(),
});

export type RuleInput = z.infer<typeof ruleInputSchema>;

export const updateRuleInputSchema = ruleInputSchema.partial();
export type UpdateRuleInput = z.infer<typeof updateRuleInputSchema>;

export const ruleOrderInputSchema = z.object({ ruleIds: z.array(z.uuid()).min(1).max(500) });
export type RuleOrderInput = z.infer<typeof ruleOrderInputSchema>;

export const ruleSchema = z.object({
  id: z.uuid(),
  pattern: z.string(),
  categoryId: z.uuid(),
  /** The category's kind: a rule only matches transactions of that kind. */
  kind: categoryKindSchema,
  markShared: z.boolean(),
  /** First match wins, lowest position first. */
  position: z.number().int().nonnegative(),
});

export type Rule = z.infer<typeof ruleSchema>;

export const ruleResponseSchema = z.object({ rule: ruleSchema });
export type RuleResponse = z.infer<typeof ruleResponseSchema>;

export const ruleListResponseSchema = z.object({ rules: z.array(ruleSchema) });
export type RuleListResponse = z.infer<typeof ruleListResponseSchema>;

/** Earlier uncategorized transactions a rule would categorize, before applying it. */
export const ruleMatchesResponseSchema = z.object({ count: z.number().int().nonnegative() });
export type RuleMatchesResponse = z.infer<typeof ruleMatchesResponseSchema>;

export const ruleApplyResponseSchema = z.object({ updated: z.number().int().nonnegative() });
export type RuleApplyResponse = z.infer<typeof ruleApplyResponseSchema>;

/** What a rule looks at: the bank's name for the other party and the description. */
export interface RuleSubject {
  kind: Rule['kind'];
  counterparty: string | null;
  description: string;
}

/** Whether the rule's text appears in the counterparty or the description. */
export function ruleMatches(rule: Pick<Rule, 'pattern' | 'kind'>, subject: RuleSubject): boolean {
  if (rule.kind !== subject.kind) return false;
  const needle = matchKey(rule.pattern);
  if (needle === '') return false;
  return [subject.counterparty, subject.description].some(
    (text) => text !== null && matchKey(text).includes(needle),
  );
}

/**
 * The rule that decides for a transaction: the first matching one by position. Pass only
 * rules whose category is still active.
 */
export function firstMatchingRule<T extends Pick<Rule, 'pattern' | 'kind' | 'position'>>(
  rules: readonly T[],
  subject: RuleSubject,
): T | undefined {
  return [...rules]
    .sort((a, b) => a.position - b.position)
    .find((rule) => ruleMatches(rule, subject));
}
