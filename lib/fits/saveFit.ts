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
 * content. `ts` is minted once each time the sheet opens and kept across a
 * retry there, so a retried upload lands on (and `upsert: true`
 * overwrites) its own earlier partial upload instead of leaving a second
 * pair behind. `insertFit` best-effort deletes the previous pair once this
 * new one is confirmed committed.
 *
 * Cover + thumbnail are one unit, uploaded in parallel. A failure waits for
 * both to settle, so a retry never races an upload still in flight. Nothing
 * is removed on failure: a retry in the sheet reuses these paths, and an earlier attempt
 * may have committed them, so deleting could leave a saved Fit pointing at
 * missing files. An orphaned pair is harmless.
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

/**
 * Saves the Fit and replaces its placements in one transaction, through the
 * `save_fit` database function (0017_save_fit.sql): a failed save changes
 * nothing in the database. The owner comes from the session, and `fitId` and
 * each placement's own `id` stay fixed across a retry, so resending is safe.
 *
 * Cover files stay put on any failure: a lost response or a gateway error
 * doesn't say whether the save committed. `previousCoverPath` and
 * `previousThumbPath` (the Fit's cover pair before this save, `null` for a
 * brand-new Fit or a pre-thumbnail Fit) are best-effort deleted once the save
 * has committed -- never awaited into the failure path, since a cleanup
 * failure must not undo or mis-report an otherwise-successful save.
 */
export async function insertFit(
  fitId: string,
  name: string,
  coverPath: string,
  thumbPath: string,
  previousCoverPath: string | null,
  previousThumbPath: string | null,
  canvasBackgroundColor: string | null,
  items: FitItemPlacement[],
): Promise<void> {
  const { error } = await supabase.rpc('save_fit', {
    p_fit_id: fitId,
    p_name: name,
    p_cover_path: coverPath,
    p_cover_thumb_path: thumbPath,
    p_canvas_background_color: canvasBackgroundColor,
    p_items: items.map((item) => ({
      id: item.id,
      item_id: item.wardrobeItemId,
      x: item.x,
      y: item.y,
      scale: item.scale,
      rotation: item.rotation,
      z_index: item.zIndex,
    })),
  });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  const stalePaths = [previousCoverPath, previousThumbPath].filter(
    (path): path is string => Boolean(path) && path !== coverPath && path !== thumbPath,
  );
  if (stalePaths.length > 0) {
    await Promise.resolve(supabase.storage.from('wardrobe').remove(stalePaths)).catch(() => {});
  }
}
