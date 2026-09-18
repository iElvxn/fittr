import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import type { FitItemPlacement } from './saveFit';

/**
 * Placements only -- the Fit's own name/cover metadata comes from
 * `listFits.ts`'s already-cached list (see `app/item/[id].tsx`'s "no
 * separate single-item query" convention), so this covers just what
 * edit-mode seeding needs that the list doesn't already have.
 */
export async function getFitItems(fitId: string): Promise<FitItemPlacement[]> {
  const { data, error } = await supabase
    .from('fit_items')
    .select('id, item_id, x, y, scale, rotation, z_index')
    .eq('fit_id', fitId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    wardrobeItemId: row.item_id,
    x: row.x,
    y: row.y,
    scale: row.scale,
    rotation: row.rotation,
    zIndex: row.z_index,
  }));
}
