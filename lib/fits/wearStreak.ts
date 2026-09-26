import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { addDays } from '@/lib/planner/week';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

/**
 * Plain, directly-testable core (same split as `wornFitIds.ts`): every
 * local date the user wore anything, deduplicated on the device -- two Fits
 * worn on one day still count as one streak day.
 */
export async function getWearDates(userId: string): Promise<Set<string>> {
  // Newest first, so if the response is ever capped (PostgREST's max-rows)
  // it's the oldest history that drops, not the days the streak counts.
  const { data, error } = await supabase
    .from('fit_wears')
    .select('worn_on')
    .eq('user_id', userId)
    .order('worn_on', { ascending: false });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return new Set(((data ?? []) as { worn_on: string }[]).map((row) => row.worn_on));
}

/** Every wear write invalidates `['wearDates', userId]` (see `invalidateWearQueries`). */
export function useWearDates(userId: string | undefined) {
  return useQuery({
    queryKey: ['wearDates', userId],
    queryFn: () => getWearDates(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Story 4.4: consecutive days with any wear, counted back from today when
 * today is worn, otherwise from yesterday -- so a streak isn't shown as
 * broken before the user has had the chance to get dressed. Steps through
 * `addDays`, which is safe across month ends and daylight-saving days.
 */
export function wearStreak(dates: ReadonlySet<string>, today: string): number {
  let day = dates.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (dates.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}
