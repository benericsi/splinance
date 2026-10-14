import { describe, expect, it } from 'vitest';
import {
  firstMatchingRule,
  matchKey,
  ruleInputSchema,
  ruleMatches,
  suggestRulePattern,
} from './rules';

const rule = (pattern: string, position = 0, kind: 'expense' | 'income' = 'expense') => ({
  pattern,
  kind,
  position,
});

const tesco = {
  kind: 'expense' as const,
  counterparty: 'TESCO 44049 O NKISZOLG',
  description: 'Weekly shop',
};

describe('matchKey', () => {
  it('drops accents and case and collapses spaces', () => {
    expect(matchKey('  Gyógyszertár   KLEOPÁTRA ')).toBe('gyogyszertar kleopatra');
  });
});

describe('ruleMatches', () => {
  it('finds the text in the counterparty or the description', () => {
    expect(ruleMatches(rule('tesco'), tesco)).toBe(true);
    expect(ruleMatches(rule('weekly'), tesco)).toBe(true);
    expect(ruleMatches(rule('Tésco 44049'), tesco)).toBe(true);
    expect(ruleMatches(rule('lidl'), tesco)).toBe(false);
  });

  it('only matches its own kind and ignores a missing counterparty', () => {
    expect(ruleMatches(rule('tesco', 0, 'income'), tesco)).toBe(false);
    expect(
      ruleMatches(rule('salary', 0, 'income'), {
        kind: 'income',
        counterparty: null,
        description: 'September salary',
      }),
    ).toBe(true);
  });
});

describe('firstMatchingRule', () => {
  it('lets the lowest position win', () => {
    const rules = [rule('tesco', 2), rule('nkiszolg', 1), rule('aldi', 0)];
    expect(firstMatchingRule(rules, tesco)?.pattern).toBe('nkiszolg');
    expect(firstMatchingRule<ReturnType<typeof rule>>([], tesco)).toBeUndefined();
  });
});

describe('ruleInputSchema', () => {
  it('needs a short, non-trivial pattern', () => {
    const base = { categoryId: '01a1216a-b248-781c-9cc6-cd68276fcdfc', markShared: false };
    expect(ruleInputSchema.parse({ ...base, pattern: '  tesco ' }).pattern).toBe('tesco');
    expect(ruleInputSchema.safeParse({ ...base, pattern: 'a' }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, pattern: 'x'.repeat(61) }).success).toBe(false);
  });
});

describe('suggestRulePattern', () => {
  it('keeps the merchant, drops branch and card numbers', () => {
    expect(suggestRulePattern('TESCO 44049 O NKISZOLG')).toBe('tesco');
    expect(suggestRulePattern('Spotify P46ED88101')).toBe('spotify');
    expect(suggestRulePattern('Revolut**4344*')).toBe('revolut');
    expect(suggestRulePattern('APPLE.COM/BILL')).toBe('apple.com/bill');
    expect(suggestRulePattern('Moto Pizza Madach')).toBe('moto pizza madach');
  });

  it('falls back to the whole name when too little is left', () => {
    expect(suggestRulePattern('7 ELEVEN')).toBe('7 eleven');
  });
});
