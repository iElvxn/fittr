import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { todayLocalDate } from './localDate';

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
 * *today's* local calendar date, so the Fit detail screen can render an
 * already-worn-today state and decide insert-vs-delete on a "Wear today" tap.
 */
export async function getTodayWornFitIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('fit_wears')
    .select('fit_id')
    .eq('user_id', userId)
    .eq('worn_on', todayLocalDate());

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return new Set((data ?? []).map((row: { fit_id: string }) => row.fit_id));
}

/** Mirrors `useFitWearCounts` -- live Supabase read, no local cache-of-record. */
export function useTodayWornFitIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['todayWornFitIds', userId],
    queryFn: () => getTodayWornFitIds(userId as string),
    enabled: Boolean(userId),
  });
}
