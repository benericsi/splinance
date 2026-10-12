/**
 * A person's name as a comparable key: accents and case dropped, words sorted, so
 * "BENE RICHÁRD", "Richárd Bene" and "RICHARD BENE" are the same person. Banks write
 * names in either order (Hungarian family name first, or not) and often without accents.
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{Letter}]+/u)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Whether `name` is one of `names` (as `nameKey` compares them). Empty names never match. */
export function isOneOf(name: string, names: readonly string[]): boolean {
  const key = nameKey(name);
  return key !== '' && names.some((other) => nameKey(other) === key);
}
