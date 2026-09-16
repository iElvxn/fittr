import { supabase } from '@/lib/supabase';
import { WardrobeItemError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import type { WardrobeItemCategory } from './addItem';

export type UpdateWardrobeItemInput = {
  category: WardrobeItemCategory;
  colorHex: string | null;
  name?: string;
  brand?: string;
  notes?: string;
};

/**
 * RLS (`wardrobe_items_update_own`) already scopes the write to the
 * signed-in owner, so this takes only the item id -- no `userId` to check
 * against here, unlike the insert path.
 */
export async function updateWardrobeItem(itemId: string, input: UpdateWardrobeItemInput): Promise<void> {
  const { error } = await supabase
    .from('wardrobe_items')
    .update({
      category: input.category,
      color_hex: input.colorHex,
      name: input.name?.trim() || null,
      brand: input.brand?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq('id', itemId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}
