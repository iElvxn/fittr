import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { toWearRef, WEAR_PHOTO_COLUMNS, type WearPhotoRow, type WearRef } from './wearRef';

/**
 * Plain, directly-testable core (same split as `getFitItems.ts`): how many
 * times each Fit has been worn, counted on the device from the user's
 * `fit_wears` rows. A Fit with no rows is simply absent from the map --
 * My Fits reads that as "never worn" (Worn filter, "Saved {date}" line).
 */
export async function getFitWearCounts(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('fit_wears').select('fit_id').eq('user_id', userId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { fit_id: string }[]) {
    counts.set(row.fit_id, (counts.get(row.fit_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Mirrors `listFits.ts`'s `useFits` -- live Supabase read, no local
 * cache-of-record. The query key stays `['wornFitIds', userId]`: Fit
 * detail's "Wear today" invalidates it by that exact key.
 */
export function useFitWearCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['wornFitIds', userId],
    queryFn: () => getFitWearCounts(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Story 4.2: distinct from `getFitWearCounts` ("ever worn") -- this narrows to
 * *today's* local calendar date, so Fit detail and Home can render an
 * already-worn-today state and decide insert-vs-delete on a "Wear today" tap.
 * Story 5.4: each Fit id maps to today's wear and its photo, so an undo can
 * confirm first when a photo would go with it, and Home can add one. It's a
 * Map, so `.has(fitId)` still answers "worn today?".
 * `today` is the screen's `useToday()` date, not read here, so the query
 * and its cache key always describe the same day.
 */
export async function getTodayWornFitIds(userId: string, today: string): Promise<Map<string, WearRef>> {
  const { data, error } = await supabase
    .from('fit_wears')
    .select(`id, fit_id, ${WEAR_PHOTO_COLUMNS}`)
    .eq('user_id', userId)
    .eq('worn_on', today);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return new Map(((data ?? []) as (WearPhotoRow & { fit_id: string })[]).map((row) => [row.fit_id, toWearRef(row)]));
}

/**
 * Mirrors `useFitWearCounts` -- live Supabase read, no local cache-of-record.
 * The date is in the key, so a new day is a new query that loads rather
 * than yesterday's cached wears standing in for today. Every wear write
 * still refetches it through `invalidateWearQueries`, whose
 * `['todayWornFitIds', userId]` prefix matches every day's key.
 */
export function useTodayWornFitIds(userId: string | undefined, today: string) {
  return useQuery({
    queryKey: ['todayWornFitIds', userId, today],
    queryFn: () => getTodayWornFitIds(userId as string, today),
    enabled: Boolean(userId),
  });
}
