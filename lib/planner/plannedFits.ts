import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from '@/lib/fits/errors';
import { toWearRef, WEAR_PHOTO_COLUMNS, wearKey, type WearPhotoRow, type WearRef } from '@/lib/fits/wearRef';
import { addDays, monthEndOf } from './week';

export type PlannedFitRow = {
  planned_on: string;
  fit_id: string;
};

function classify(error: unknown): never {
  if (isNoConnectionError(error)) {
    throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
  }
  throw error;
}

/**
 * Plain, directly-testable core (same split as `wornFitIds.ts`). No
 * `user_id` filter: the `planned_fits_select_own` policy
 * (`0012_planned_fits.sql`) already scopes every read to the caller.
 * `start`/`end` are inclusive local dates.
 */
export async function getPlannedFits(start: string, end: string): Promise<PlannedFitRow[]> {
  const { data, error } = await supabase
    .from('planned_fits')
    .select('planned_on, fit_id')
    .gte('planned_on', start)
    .lte('planned_on', end);

  if (error) {
    classify(error);
  }

  return (data ?? []) as PlannedFitRow[];
}

/**
 * Assign and replace are the same write: one upsert on the table's
 * `(user_id, planned_on)` unique constraint. No `id` is sent -- the server
 * default fills it on insert, and a replace leaves it alone.
 */
export async function planFit(userId: string, plannedOn: string, fitId: string): Promise<void> {
  const { error } = await supabase
    .from('planned_fits')
    .upsert({ user_id: userId, planned_on: plannedOn, fit_id: fitId }, { onConflict: 'user_id,planned_on' });

  if (error) {
    classify(error);
  }
}

/** Hard delete -- plans have no `deleted_at` (see `0012_planned_fits.sql`). RLS confines it to the caller's row. */
export async function unplanDay(plannedOn: string): Promise<void> {
  const { error } = await supabase.from('planned_fits').delete().eq('planned_on', plannedOn);

  if (error) {
    classify(error);
  }
}

export type WearsInRange = {
  /** `${fit_id}|${worn_on}` for every wear, so a day reads "Worn" only when *its* Fit was worn on *that* day. */
  keys: Set<string>;
  /** The same keys to each wear's id and photo (Story 5.4), for the tiles and the day sheet. */
  byKey: Map<string, WearRef>;
};

/** Every wear in the range, with its photo. */
export async function getWearsBetween(start: string, end: string): Promise<WearsInRange> {
  const { data, error } = await supabase
    .from('fit_wears')
    .select(`id, fit_id, worn_on, ${WEAR_PHOTO_COLUMNS}`)
    .gte('worn_on', start)
    .lte('worn_on', end);

  if (error) {
    classify(error);
  }

  const byKey = new Map<string, WearRef>();
  for (const row of (data ?? []) as (WearPhotoRow & { fit_id: string; worn_on: string })[]) {
    byKey.set(wearKey(row.fit_id, row.worn_on), toWearRef(row));
  }
  return { keys: new Set(byKey.keys()), byKey };
}

/**
 * One cache entry per week, so paging back to a week already seen shows it
 * immediately. Writes invalidate the `['plannedFits', userId]` prefix, which
 * covers every week.
 */
export function usePlannedFits(userId: string | undefined, weekStart: string) {
  return useQuery({
    queryKey: ['plannedFits', userId, weekStart],
    queryFn: () => getPlannedFits(weekStart, addDays(weekStart, 6)),
    enabled: Boolean(userId),
  });
}

/** Mirrors `usePlannedFits` for the visible week's wears. */
export function useWeekWears(userId: string | undefined, weekStart: string) {
  return useQuery({
    queryKey: ['fitWearsRange', userId, weekStart],
    queryFn: () => getWearsBetween(weekStart, addDays(weekStart, 6)),
    enabled: Boolean(userId),
  });
}

/**
 * Story 5.3's month view: the same reads over the whole month. The `'month'`
 * key segment keeps a month whose 1st is a Monday from sharing the entry of
 * the week that starts that day. Write invalidations (`['plannedFits',
 * userId]`, `invalidateWearQueries`) are prefixes, so they cover these too.
 * `enabled` is false while the week view is showing.
 */
export function usePlannedMonth(userId: string | undefined, monthStart: string, enabled: boolean) {
  return useQuery({
    queryKey: ['plannedFits', userId, 'month', monthStart],
    queryFn: () => getPlannedFits(monthStart, monthEndOf(monthStart)),
    enabled: Boolean(userId) && enabled,
  });
}

/** Mirrors `usePlannedMonth` for the month's wears. */
export function useMonthWears(userId: string | undefined, monthStart: string, enabled: boolean) {
  return useQuery({
    queryKey: ['fitWearsRange', userId, 'month', monthStart],
    queryFn: () => getWearsBetween(monthStart, monthEndOf(monthStart)),
    enabled: Boolean(userId) && enabled,
  });
}
