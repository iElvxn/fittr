import { supabase } from '@/lib/supabase';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import type { FitItemPlacement } from './saveFit';

/**
 * A placement plus its source wardrobe item's current `category` and
 * deletion status, embedded via the `wardrobe_items` FK -- `wardrobe_items`'
 * own SELECT RLS has no `deleted_at` condition, so a soft-deleted row is
 * still readable here for its own owner, which is what lets this recover
 * the true category instead of guessing (see edit-mode seeding).
 */
export type FitItemPlacementWithSource = FitItemPlacement & {
  category: WardrobeItemCategory;
  wardrobeItemDeleted: boolean;
};

/**
 * The untyped Supabase client (no generated `Database` schema in this repo,
 * matching `listFits.ts`/`listItems.ts`'s own `as FitRow[]`-style casts)
 * infers an embedded to-one relationship as an array since it has no FK
 * metadata to narrow it -- PostgREST itself always returns a single object
 * here (many `fit_items` rows to one `wardrobe_items` row), so this row
 * shape reflects the real runtime response, not the inferred query type.
 */
type FitItemRow = {
  id: string;
  item_id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z_index: number;
  wardrobe_items: { category: WardrobeItemCategory; deleted_at: string | null } | null;
};

/**
 * Placements only -- the Fit's own name/cover metadata comes from
 * `listFits.ts`'s already-cached list (see `app/item/[id].tsx`'s "no
 * separate single-item query" convention), so this covers just what
 * edit-mode seeding needs that the list doesn't already have.
 */
export async function getFitItems(fitId: string): Promise<FitItemPlacementWithSource[]> {
  const { data, error } = await supabase
    .from('fit_items')
    .select('id, item_id, x, y, scale, rotation, z_index, wardrobe_items(category, deleted_at)')
    .eq('fit_id', fitId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return ((data ?? []) as unknown as FitItemRow[]).map((row) => ({
    id: row.id,
    wardrobeItemId: row.item_id,
    x: row.x,
    y: row.y,
    scale: row.scale,
    rotation: row.rotation,
    zIndex: row.z_index,
    // A `null` join is defensive, not expected (see `FitItemRow`'s doc
    // comment) -- but treating it as "not deleted" would silently regress
    // to a wrong, live-looking placement with an undefined category rather
    // than the gap it actually is, so it's folded into the same branch as a
    // confirmed deletion. `'top'` is only reached in that unreachable-in-
    // practice case, not the normal deleted-item path (which always has a
    // real recovered category).
    category: row.wardrobe_items ? row.wardrobe_items.category : 'top',
    wardrobeItemDeleted: row.wardrobe_items ? row.wardrobe_items.deleted_at != null : true,
  }));
}
