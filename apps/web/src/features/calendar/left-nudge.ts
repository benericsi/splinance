/**
 * Households whose "Add income" offer on the overview a person has hidden. Kept in this
 * browser only, per user: a preference about one card, nothing the server needs. Once the
 * month has income the real card shows whatever is stored here.
 */
const key = (userId: string) => `splinance-left-nudge-hidden:${userId}`;

function readHidden(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const isLeftNudgeHidden = (userId: string, householdId: string) =>
  readHidden(userId).includes(householdId);

export function hideLeftNudge(userId: string, householdId: string): void {
  const hidden = readHidden(userId);
  if (hidden.includes(householdId)) return;
  try {
    localStorage.setItem(key(userId), JSON.stringify([...hidden, householdId].slice(-50)));
  } catch {
    // Blocked storage: it stays hidden until the page is loaded again.
  }
}
