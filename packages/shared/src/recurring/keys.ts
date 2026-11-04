import { matchKey, suggestRulePattern } from '../rules';

/**
 * Turning bank text and names into the texts recurring payments are matched by.
 *
 * Both functions end up stored (a detected series keeps its key as its pattern, a dismissed
 * suggestion is remembered by its key), so changing what they return orphans those rows:
 * such a change needs a data migration of `recurring_series.pattern_key`. The tests pin
 * their outputs for that reason.
 */

/** Web shop suffixes banks print after a merchant ("WOLT.COM", "Netflix.com"). */
const DOMAIN_SUFFIX = /\.(com|hu|net|org|io|eu|co)$/;

/**
 * The text a detected series is known by: the bank's counterparty without branch and card
 * numbers (as rule suggestions trim it), else the description; accents, case and a web
 * shop suffix dropped. "SPOTIFY P46ED88101" -> "spotify", "Netflix.com" -> "netflix",
 * "TESCO 44049 O NKISZOLG" -> "tesco", a hand-entered "Netflix" -> "netflix".
 */
export function recurringKey(row: { counterparty: string | null; description: string }): string {
  const counterparty = row.counterparty?.trim() ?? '';
  const text = counterparty === '' ? row.description : suggestRulePattern(counterparty);
  return matchKey(text).replace(DOMAIN_SUFFIX, '').slice(0, 60).trim();
}

/**
 * Words that describe a plan rather than the merchant, skipped when suggesting what a
 * hand-added series should match ("Spotify Premium Duo" is about Spotify). As match keys:
 * no accents ("havi" is "havi", "előfizetés" is "elofizetes").
 */
const GENERIC_WORDS = new Set([
  'premium',
  'family',
  'duo',
  'individual',
  'student',
  'standard',
  'basic',
  'plus',
  'pro',
  'subscription',
  'membership',
  'monthly',
  'yearly',
  'annual',
  'plan',
  'the',
  'and',
  'havi',
  'eves',
  'elofizetes',
  'csomag',
  'dij',
  'tagsag',
  'berlet',
]);

/**
 * What a hand-added series should match by default: the first word of its name with at
 * least three letters that is not a generic plan word. "Spotify xyz" -> "spotify",
 * "Netflix Standard" -> "netflix", "Premium YouTube" -> "youtube". Falls back to the whole
 * name as a match key; the person can always edit it.
 */
export function suggestRecurringPattern(name: string): string {
  const key = matchKey(name);
  const word = key
    .split(/[^\p{L}\p{N}]+/u)
    .find((candidate) => /^\p{L}{3,}$/u.test(candidate) && !GENERIC_WORDS.has(candidate));
  return word ?? key.slice(0, 60).trim();
}
