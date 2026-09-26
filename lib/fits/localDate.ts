/**
 * Device-local calendar date as `YYYY-MM-DD` -- deliberately not
 * `toISOString().split('T')[0]`, which reads the UTC date and would record
 * the wrong day for any user west of UTC in the evening (e.g. 11:30pm PT is
 * already tomorrow in UTC). Shared with `lib/planner/week.ts`, which builds
 * every Planner date through it.
 */
export function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Shared by `markFitWorn.ts` (write), `wornFitIds.ts` (read) and the
 * Planner so "today" can't drift between them.
 */
export function todayLocalDate(): string {
  return toLocalDate(new Date());
}
