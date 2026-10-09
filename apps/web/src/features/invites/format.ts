const DAY_MS = 24 * 60 * 60 * 1000;
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "in 7 days", "tomorrow", "today": rounded up, so a link never looks expired early. */
export function expiresIn(expiresAt: string): string {
  const days = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
  return relative.format(days, 'day');
}
