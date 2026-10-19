import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import { WRITE_ONCE_CACHE_CONTROL } from '@/lib/storageCache';
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
 * Long edge (px) of a Fit cover's small WebP thumbnail. The collage is
 * taller than the 3:4 grid tile, so a `contain`ed cover is height-bound: the
 * tile is ~259pt tall on the largest phones, and 3x needs ~780px. Small
 * surfaces (My Fits grid, Home's week strip, the Planner) show this instead
 * of the full-resolution PNG cover.
 */
export const FIT_COVER_THUMB_LONG_EDGE = 800;

/**
 * Uploads the rendered collage and its small WebP thumbnail under the Fit's
 * own folder, one pair per save (`cover-{ts}.png` + `cover-{ts}_thumb.webp`,
 * not a fixed `cover.png`) -- overwriting the same path in place made a
 * re-saved cover indistinguishable, URL-wise, from the one before it, which
 * neither `expo-image`'s cache nor Storage's own CDN would treat as changed
 * content. `ts` is minted once per save attempt by the caller and kept
 * across a retry, so a retried upload lands on (and `upsert: true`
 * overwrites) its own earlier partial upload instead of leaving a second
 * pair behind. `insertFit` best-effort deletes the previous pair once this
 * new one is confirmed committed.
 *
 * Cover + thumbnail are one unit: both upload in parallel and, on any
 * failure, both are removed. The rollback waits for both uploads to settle
 * first -- removing while the sibling is still in flight would let that
 * object land afterwards, orphaned.
 */
export async function uploadCover(
  userId: string,
  fitId: string,
  ts: number,
  collageUri: string,
  thumbUri: string,
): Promise<{ coverPath: string; thumbPath: string }> {
  const coverPath = `${userId}/fits/${fitId}/cover-${ts}.png`;
  const thumbPath = `${userId}/fits/${fitId}/cover-${ts}_thumb.webp`;

  const results = await Promise.allSettled([
    uploadOne(coverPath, collageUri, 'image/png'),
    uploadOne(thumbPath, thumbUri, 'image/webp'),
  ]);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) {
    await rollbackCover(coverPath, thumbPath);
    throw failure.reason;
  }

  return { coverPath, thumbPath };
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
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }
}

async function rollbackCover(coverPath: string, thumbPath: string): Promise<void> {
  await Promise.resolve(supabase.storage.from('wardrobe').remove([coverPath, thumbPath])).catch(() => {});
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
 * fixed across a retry after a no-connection failure. `previousCoverPath`
 * and `previousThumbPath` (the Fit's cover pair before this save, `null` for
 * a brand-new Fit or a pre-thumbnail Fit) are best-effort deleted once every
 * write below has fully committed -- never
 * awaited into the failure path, since a cleanup failure must not undo or
 * mis-report an otherwise-successful save.
 */
export async function insertFit(
  userId: string,
  fitId: string,
  name: string,
  coverPath: string,
  thumbPath: string,
  previousCoverPath: string | null,
  previousThumbPath: string | null,
  canvasBackgroundColor: string | null,
  items: FitItemPlacement[],
): Promise<void> {
  const { error: fitError } = await supabase.from('fits').upsert(
    {
      id: fitId,
      user_id: userId,
      name,
      cover_path: coverPath,
      cover_thumb_path: thumbPath,
      canvas_background_color: canvasBackgroundColor,
      // Explicit, not left to the column default: a retry after
      // `rollbackOrphanedFit` soft-deleted this same row on an earlier
      // attempt must clear that back out, since `upsert` only overwrites
      // columns present in this payload.
      deleted_at: null,
    },
    { onConflict: 'id' },
  );

  if (fitError) {
    await rollbackCover(coverPath, thumbPath);
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
    await rollbackCover(coverPath, thumbPath);
    await rollbackOrphanedFit(fitId);
    if (isNoConnectionError(itemsError)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw itemsError;
  }

  await deleteOrphanedFitItems(fitId, rows.map((row) => row.id));

  const stalePaths = [previousCoverPath, previousThumbPath].filter(
    (path): path is string => Boolean(path) && path !== coverPath && path !== thumbPath,
  );
  if (stalePaths.length > 0) {
    await Promise.resolve(supabase.storage.from('wardrobe').remove(stalePaths)).catch(() => {});
  }
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
