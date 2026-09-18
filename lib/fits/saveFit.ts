import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

/** One canvas placement, shaped straight off `stores/fitBuilder.ts`'s `PlacedItem`. */
export type FitItemPlacement = {
  id: string;
  wardrobeItemId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
};

/**
 * Uploads the rendered collage under the Fit's own folder. `upsert: true`
 * (same reasoning as `uploadItem`) makes a retried save -- after a network
 * hiccup -- overwrite the same object rather than fail, since `fitId` (and
 * therefore the path) stays the same across a retry.
 */
export async function uploadCover(userId: string, fitId: string, collageUri: string): Promise<string> {
  const coverPath = `${userId}/fits/${fitId}/cover.png`;
  const file = new File(collageUri);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage.from('wardrobe').upload(coverPath, arrayBuffer, {
    contentType: 'image/png',
    upsert: true,
  });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return coverPath;
}

async function rollbackCover(coverPath: string): Promise<void> {
  await supabase.storage.from('wardrobe').remove([coverPath]).catch(() => {});
}

/**
 * `fits` has no DELETE policy (soft delete only, like every other table in
 * this schema except `fit_items` itself -- see `0004_fits.sql`), so an
 * orphaned `fits` row left behind by a failed `fit_items` insert is rolled
 * back with the same soft-delete UPDATE the edit/delete flow will use later,
 * not a hard delete that RLS would just silently no-op.
 */
async function rollbackOrphanedFit(fitId: string): Promise<void> {
  await Promise.resolve(supabase.from('fits').update({ deleted_at: new Date().toISOString() }).eq('id', fitId)).catch(
    () => {},
  );
}

/**
 * Upserts the `fits` row, then the `fit_items` rows for every placement.
 * `onConflict: 'id'` on both -- same idempotent-retry reasoning as
 * `insertWardrobeItem`, since `fitId` and each placement's own `id` stay
 * fixed across a retry after a no-connection failure.
 */
export async function insertFit(
  userId: string,
  fitId: string,
  name: string,
  coverPath: string,
  items: FitItemPlacement[],
): Promise<void> {
  const { error: fitError } = await supabase.from('fits').upsert(
    {
      id: fitId,
      user_id: userId,
      name,
      cover_path: coverPath,
      // Explicit, not left to the column default: a retry after
      // `rollbackOrphanedFit` soft-deleted this same row on an earlier
      // attempt must clear that back out, since `upsert` only overwrites
      // columns present in this payload.
      deleted_at: null,
    },
    { onConflict: 'id' },
  );

  if (fitError) {
    await rollbackCover(coverPath);
    if (isNoConnectionError(fitError)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw fitError;
  }

  const rows = items.map((item) => ({
    id: item.id,
    fit_id: fitId,
    item_id: item.wardrobeItemId,
    x: item.x,
    y: item.y,
    scale: item.scale,
    rotation: item.rotation,
    z_index: item.zIndex,
  }));

  const { error: itemsError } = await supabase.from('fit_items').upsert(rows, { onConflict: 'id' });

  if (itemsError) {
    await rollbackCover(coverPath);
    await rollbackOrphanedFit(fitId);
    if (isNoConnectionError(itemsError)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw itemsError;
  }

  await deleteOrphanedFitItems(fitId, rows.map((row) => row.id));
}

/**
 * Re-saving an edited Fit reuses the same `fitId`, so the upsert above
 * updates/inserts the current placements but never removes a row for an
 * item the user took off the canvas -- that row is deleted here, scoped to
 * this `fitId` so it can never touch another Fit's placements. Ids are our
 * own client-generated uuids (never containing PostgREST-reserved
 * characters), so they're safe to inline unescaped, same trust boundary as
 * `id.eq.<uuid>` filters elsewhere in this codebase.
 */
async function deleteOrphanedFitItems(fitId: string, currentItemIds: string[]): Promise<void> {
  const query = supabase.from('fit_items').delete().eq('fit_id', fitId);
  const { error } =
    currentItemIds.length > 0 ? await query.not('id', 'in', `(${currentItemIds.join(',')})`) : await query;

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}
