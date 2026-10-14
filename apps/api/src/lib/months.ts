/** First day of the month and of the month after, as `YYYY-MM-DD`. */
export function monthRange(month: string): [string, string] {
  const [year = 0, monthIndex = 1] = month.split('-').map(Number);
  const next =
    monthIndex === 12
      ? `${String(year + 1)}-01`
      : `${String(year)}-${String(monthIndex + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}
