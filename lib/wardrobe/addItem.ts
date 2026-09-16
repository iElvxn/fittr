import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import { WardrobeItemError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

export type WardrobeItemCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

/**
 * Single source of truth for the fixed category list -- shared by the
 * add-item category selector (`app/add-item.tsx`) and the Wardrobe grid's
 * filter chips (`components/wardrobe/CategoryFilterChips.tsx`) so the two
 * can't drift apart.
 */
export const CATEGORY_OPTIONS: { value: WardrobeItemCategory; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'accessory', label: 'Accessory' },
];

export type NewWardrobeItemInput = {
  category: WardrobeItemCategory;
  colorHex: string | null;
  name?: string;
  brand?: string;
  notes?: string;
  cutoutPath: string;
  thumbPath: string;
};

/**
 * Uploads both files under the item's own folder. `upsert: true` on both
 * (same as `uploadAvatar`) makes a retried save -- after the app is
 * backgrounded mid-upload, or a network hiccup -- overwrite the same
 * objects rather than fail, since `itemId` (and therefore the path) is
 * identical on retry.
 *
 * The two uploads run in parallel and are rolled back together on any
 * failure: the spec's no-connection matrix row promises "no partial
 * upload," and a plain sequential await could leave one object stored
 * without its pair if connectivity drops between them. Removing whatever
 * did succeed keeps that promise true even in that transient case.
 */
export async function uploadItem(
  userId: string,
  itemId: string,
  cutoutUri: string,
  thumbUri: string,
): Promise<{ cutoutPath: string; thumbPath: string }> {
  const cutoutPath = `${userId}/items/${itemId}/cutout.png`;
  const thumbPath = `${userId}/items/${itemId}/thumb.webp`;

  try {
    await Promise.all([
      uploadOne(cutoutPath, cutoutUri, 'image/png'),
      uploadOne(thumbPath, thumbUri, 'image/webp'),
    ]);
  } catch (error) {
    await supabase.storage.from('wardrobe').remove([cutoutPath, thumbPath]).catch(() => {});
    throw error;
  }

  return { cutoutPath, thumbPath };
}

async function uploadOne(path: string, localUri: string, contentType: string): Promise<void> {
  const file = new File(localUri);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage.from('wardrobe').upload(path, arrayBuffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}

/**
 * `upsert` on `id`, not a plain `insert`: the same double-submit retry that
 * `uploadItem` makes idempotent for Storage must also be idempotent for the
 * row -- otherwise a retried save whose first attempt's row already landed
 * would fail on the primary-key conflict instead of quietly succeeding.
 */
export async function insertWardrobeItem(
  userId: string,
  itemId: string,
  input: NewWardrobeItemInput,
): Promise<void> {
  const { error } = await supabase.from('wardrobe_items').upsert(
    {
      id: itemId,
      user_id: userId,
      category: input.category,
      color_hex: input.colorHex,
      name: input.name?.trim() || null,
      brand: input.brand?.trim() || null,
      notes: input.notes?.trim() || null,
      cutout_path: input.cutoutPath,
      thumb_path: input.thumbPath,
    },
    { onConflict: 'id' },
  );

  if (error) {
    if (isNoConnectionError(error)) {
      throw new WardrobeItemError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}
