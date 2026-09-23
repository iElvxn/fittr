import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { todayLocalDate } from './localDate';

/**
 * Plain, directly-testable core (same split as `getFitItems.ts`) -- the
 * `fit_wears` table is read-only until Story 4.2 writes to it, so this
 * always resolves to an empty set for now, which is the correct Worn-filter
 * behavior rather than an error.
 */
export async function getWornFitIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('fit_wears').select('fit_id').eq('user_id', userId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return new Set((data ?? []).map((row: { fit_id: string }) => row.fit_id));
}

/** Mirrors `listFits.ts`'s `useFits` -- live Supabase read, no local cache-of-record. */
export function useWornFitIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['wornFitIds', userId],
    queryFn: () => getWornFitIds(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Story 4.2: distinct from `getWornFitIds` ("ever worn") -- this narrows to
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

/** Mirrors `useWornFitIds` -- live Supabase read, no local cache-of-record. */
export function useTodayWornFitIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['todayWornFitIds', userId],
    queryFn: () => getTodayWornFitIds(userId as string),
    enabled: Boolean(userId),
  });
}
