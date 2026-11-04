const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "today", "yesterday" or the date: enough to spot a sign-in you do not recognize. */
export function formatLastUsed(iso: string, now = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day(now).getTime() - day(new Date(iso)).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return formatDate(iso);
}
