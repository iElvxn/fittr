import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import { WRITE_ONCE_CACHE_CONTROL } from '@/lib/storageCache';
import { WardrobeItemError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

export type WardrobeItemCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

/**
 * Single source of truth for the fixed category list and its singular
 * labels (add-item's category selector, `app/add-item.tsx`). The filter
 * chips (`components/wardrobe/CategoryFilterChips.tsx`) take their order
 * from here but use plural labels from `CATEGORY_FILTER_LABELS`.
 */
export const CATEGORY_OPTIONS: { value: WardrobeItemCategory; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'accessory', label: 'Accessory' },
];

/** Single source of truth for category value -> display label, shared by every screen/component that shows a category. */
export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WardrobeItemCategory, string>;

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
 * makes a retried save -- after the app is
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
  const cutoutPath = `${userId}/items/${itemId}/cutout.webp`;
  const thumbPath = `${userId}/items/${itemId}/thumb.webp`;

  try {
    await Promise.all([
      uploadOne(cutoutPath, cutoutUri, 'image/webp'),
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
    cacheControl: WRITE_ONCE_CACHE_CONTROL,
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
export type BatchSaveItem = {
  itemId: string;
  cutoutUri: string;
  thumbUri: string;
  category: WardrobeItemCategory;
  colorHex: string | null;
  name?: string;
  brand?: string;
  notes?: string;
};

function itemStoragePaths(userId: string, itemId: string): [string, string] {
  return [`${userId}/items/${itemId}/cutout.webp`, `${userId}/items/${itemId}/thumb.webp`];
}

/**
 * Saves items one at a time, in order, and stops at the first failure.
 * Each wardrobe item is independent, so an item whose files and row both
 * landed is kept -- never rolled back -- and reported through `onItemSaved`
 * as it lands, so the caller can mark it saved and retry only the rest.
 * (A rollback is a set of network calls that fail exactly when the
 * connection is gone, and `wardrobe_items` has no DELETE policy anyway.)
 *
 * On failure, only the failing item's own Storage objects are removed: a
 * no-op if `uploadItem` already cleaned itself up, or a real cleanup if its
 * upload succeeded but the insert didn't -- it has no row, so nothing shows
 * either way. The original error is rethrown for the caller's retry UI. A
 * retry is always safe, since every item's `itemId` upserts.
 */
export async function saveBatch(
  userId: string,
  items: BatchSaveItem[],
  onItemSaved?: (itemId: string) => void,
): Promise<void> {
  for (const item of items) {
    try {
      const { cutoutPath, thumbPath } = await uploadItem(userId, item.itemId, item.cutoutUri, item.thumbUri);
      await insertWardrobeItem(userId, item.itemId, {
        category: item.category,
        colorHex: item.colorHex,
        name: item.name,
        brand: item.brand,
        notes: item.notes,
        cutoutPath,
        thumbPath,
      });
    } catch (error) {
      await supabase.storage.from('wardrobe').remove(itemStoragePaths(userId, item.itemId)).catch(() => {});
      throw error;
    }
    // Outside the try: a throwing callback is the caller's bug, and must not
    // trigger cleanup of an item that did save.
    onItemSaved?.(item.itemId);
  }
}

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
