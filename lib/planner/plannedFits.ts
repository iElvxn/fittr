import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from '@/lib/fits/errors';
import { addDays } from './week';

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

/**
 * Every wear in the range, as `${fit_id}|${worn_on}` keys, so a day row reads
 * "Worn" only when *its* Fit was worn on *that* day.
 */
export async function getWearsBetween(start: string, end: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('fit_wears')
    .select('fit_id, worn_on')
    .gte('worn_on', start)
    .lte('worn_on', end);

  if (error) {
    classify(error);
  }

  return new Set(((data ?? []) as { fit_id: string; worn_on: string }[]).map((row) => `${row.fit_id}|${row.worn_on}`));
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
