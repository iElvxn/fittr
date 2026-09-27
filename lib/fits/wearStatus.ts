/**
 * Status lines for a Fit on a day (Stories 5.2 + 5.6), shared by Home's card
 * and the day sheet's header so both read the same. Pure: no reads here.
 */

/**
 * Today's planned Fit, following the optimistic toggle so the count moves
 * the moment Mark worn is tapped: "Planned for today · Worn 3×", or
 * "Worn 4× · including today" once worn. `counts` is undefined when the
 * count read hasn't landed (or failed), which leaves the count out.
 */
export function todayPlannedStatus(
  counts: Map<string, number> | undefined,
  fitId: string,
  serverWornToday: boolean,
  isWornToday: boolean,
): string {
  const wearCount = counts
    ? (counts.get(fitId) ?? 0) + (isWornToday && !serverWornToday ? 1 : 0) - (!isWornToday && serverWornToday ? 1 : 0)
    : null;
  if (isWornToday) {
    return wearCount ? `Worn ${wearCount}× · including today` : 'Worn today';
  }
  return wearCount ? `Planned for today · Worn ${wearCount}×` : 'Planned for today';
}

/**
 * Any other day's Fit, in the week rows' wording: "Worn" (never with a
 * count), or "Planned", adding " · Worn N×" once the Fit has been worn.
 */
export function dayFitStatus(worn: boolean, count: number | undefined): string {
  if (worn) {
    return 'Worn';
  }
  return count ? `Planned · Worn ${count}×` : 'Planned';
}
