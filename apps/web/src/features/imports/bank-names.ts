import { nameKey } from '@splinance/shared';

/**
 * The names a person goes by at their banks ("BENE RICHÁRD"), to spot transfers between
 * their own accounts in exports that do not name the holder (Revolut). Kept in this browser
 * only, per user: a convenience, and the person's legal name stays off the server.
 */
const key = (userId: string) => `splinance-bank-names:${userId}`;

export function readBankNames(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** Adds a name unless it is already there (as `nameKey` compares names). */
export function rememberBankName(userId: string, name: string): string[] {
  const names = readBankNames(userId);
  if (!name.trim() || names.some((other) => nameKey(other) === nameKey(name))) return names;
  const next = [name.trim(), ...names].slice(0, 5);
  try {
    localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    // Blocked storage: the field still works for this import.
  }
  return next;
}
