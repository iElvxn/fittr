import { supabase } from '@/lib/supabase';
import { WardrobeItemError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

/**
 * Soft delete via the same `wardrobe_items_update_own` RLS policy as
 * `updateWardrobeItem` -- there's deliberately no DELETE policy, so a
 * client-side `.delete()` call would be rejected outright.
 */
export async function deleteWardrobeItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('wardrobe_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}
