import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

/**
 * Uses the existing `fits_update_own` RLS policy (`0004_fits.sql`) -- no
 * migration needed, same shape as `deleteFit.ts`'s soft-delete update.
 */
export async function toggleFitFavorite(fitId: string, nextValue: boolean): Promise<void> {
  const { error } = await supabase.from('fits').update({ is_favorite: nextValue }).eq('id', fitId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}
