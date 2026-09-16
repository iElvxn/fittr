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
  return [`${userId}/items/${itemId}/cutout.png`, `${userId}/items/${itemId}/thumb.webp`];
}

/**
 * Batch save attempts every item in order and makes a best-effort rollback
 * on failure (per the story's UX doc: "batch stays in the queue, unsaved,
 * with a clear retry"). Items save sequentially so a failure partway through
 * only ever leaves already-committed items to roll back -- never a
 * half-uploaded one, since `uploadItem` itself is already atomic per item.
 * On failure: the failing item's own Storage objects are cleaned up
 * unconditionally -- a no-op if `uploadItem` already failed and cleaned
 * itself up, or a real cleanup if its upload succeeded but the insert didn't
 * -- then every earlier item in this attempt is rolled back (Storage + row),
 * and the original error is rethrown so the caller can show the standard
 * retry UI. This rollback is best-effort, not guaranteed: if the triggering
 * failure was a genuine connectivity loss, the rollback's own network calls
 * can fail the same way and are silently swallowed (see the calls below).
 * A later successful retry is always safe regardless, since every item's
 * `itemId` upserts rather than duplicates.
 */
export async function saveBatch(userId: string, items: BatchSaveItem[]): Promise<void> {
  const saved: string[] = [];

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
      saved.push(item.itemId);
    } catch (error) {
      await supabase.storage.from('wardrobe').remove(itemStoragePaths(userId, item.itemId)).catch(() => {});
      await Promise.all(
        saved.map(async (itemId) => {
          await supabase.storage.from('wardrobe').remove(itemStoragePaths(userId, itemId)).catch(() => {});
          // The query builder is thenable but not a real Promise (no native
          // `.catch`) -- `Promise.resolve(...)` normalizes it so a failed
          // best-effort rollback delete can't mask the original error above.
          await Promise.resolve(supabase.from('wardrobe_items').delete().eq('id', itemId)).catch(() => {});
        }),
      );
      throw error;
    }
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
