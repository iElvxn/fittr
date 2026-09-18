import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

/**
 * Soft delete via the `fits_update_own` RLS policy, same shape as
 * `lib/wardrobe/deleteItem.ts`'s `deleteWardrobeItem` -- `fits` has no
 * DELETE policy by design (`0004_fits.sql`), so a client-side `.delete()`
 * would be rejected outright.
 */
export async function deleteFit(fitId: string): Promise<void> {
  const { error } = await supabase.from('fits').update({ deleted_at: new Date().toISOString() }).eq('id', fitId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}
