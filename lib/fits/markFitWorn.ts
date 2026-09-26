import * as Crypto from 'expo-crypto';
import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { todayLocalDate } from './localDate';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Client-generated id, same convention as `stores/fitBuilder.ts`'s placed
 * items. Uses the `fit_wears_insert_own` policy (`0008_fit_wears.sql`).
 */
export async function markFitWornToday(userId: string, fitId: string): Promise<void> {
  const { error } = await supabase.from('fit_wears').insert({
    id: Crypto.randomUUID(),
    user_id: userId,
    fit_id: fitId,
    worn_on: todayLocalDate(),
  });

  if (error) {
    // `(user_id, fit_id, worn_on)` is unique (0008_fit_wears.sql, added
    // specifically to guard a double-tap) -- a duplicate insert means the
    // Fit is already marked worn today, not a real failure. Treating it as
    // an error here would revert the UI to "not worn" for a Fit that
    // genuinely is.
    if ((error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      return;
    }
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}

/**
 * Only ever targets today's row -- never accepts an arbitrary date -- so a
 * user can undo a mis-tap but can't edit past wear history through the app,
 * keeping Story 4.4's streak trustworthy. Uses the `fit_wears_delete_own`
 * policy (`0009_fit_wears_undo.sql`).
 */
export async function unmarkFitWornToday(userId: string, fitId: string): Promise<void> {
  const { error } = await supabase
    .from('fit_wears')
    .delete()
    .eq('user_id', userId)
    .eq('fit_id', fitId)
    .eq('worn_on', todayLocalDate());

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}

/**
 * Every read that reflects a wear, invalidated together after any wear
 * write (Home's Mark worn, Fit detail's Wear today): the My Fits counts and
 * Worn filter, today's worn state, the Planner's week "Worn" captions and
 * the wear streak. Resolves once every refetch has landed.
 */
export async function invalidateWearQueries(queryClient: QueryClient, userId: string): Promise<void> {
  await Promise.all(
    ['wornFitIds', 'todayWornFitIds', 'fitWearsRange', 'wearDates'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key, userId] }),
    ),
  );
}
