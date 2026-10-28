const DAY_MS = 86_400_000;
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "today", "tomorrow", "in 6 days": when a sandbox expiring at `expiresAt` is deleted. */
export function deletedWhen(expiresAt: string, now = new Date()): string {
  const days = Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS));
  return relative.format(days, 'day');
}
