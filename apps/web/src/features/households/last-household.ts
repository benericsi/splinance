// Per-browser convenience: `/` reopens the household used last. Keyed by user so two
// people sharing a browser do not land in each other's household. Not security relevant:
// the API still decides what the user may see.
const key = (userId: string) => `splinance-last-household:${userId}`;

export function readLastHousehold(userId: string): string | undefined {
  try {
    return localStorage.getItem(key(userId)) ?? undefined;
  } catch {
    // Storage can be blocked (private mode, disabled cookies).
    return undefined;
  }
}

export function rememberLastHousehold(userId: string, householdId: string): void {
  try {
    localStorage.setItem(key(userId), householdId);
  } catch {
    // Best effort only.
  }
}
