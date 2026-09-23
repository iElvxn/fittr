/**
 * Device-local calendar date as `YYYY-MM-DD` -- deliberately not
 * `toISOString().split('T')[0]`, which reads the UTC date and would record
 * the wrong day for any user west of UTC in the evening (e.g. 11:30pm PT is
 * already tomorrow in UTC). Shared by `markFitWorn.ts` (write) and
 * `wornFitIds.ts` (read) so "today" can't drift between the two.
 */
export function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
