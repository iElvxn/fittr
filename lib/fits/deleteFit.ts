import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/observability/sentry';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { deleteWearPhotoFiles } from './wearPhoto';

function classify(error: unknown): never {
  if (isNoConnectionError(error)) {
    throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
  }
  throw error;
}

/**
 * Soft delete via the `fits_update_own` RLS policy, same shape as
 * `lib/wardrobe/deleteItem.ts`'s `deleteWardrobeItem` -- `fits` has no
 * DELETE policy by design (`0004_fits.sql`), so a client-side `.delete()`
 * would be rejected outright.
 *
 * Story 5.4: the Fit's wear photos go with it. Its wear rows stay (they're
 * the streak and history), but their photo columns are cleared and the
 * files deleted. The photo paths are read *before* the soft delete, so a
 * failed read leaves the Fit untouched. Once the Fit is deleted, the
 * cleanup is best-effort: a failure is reported, never shown, since the
 * delete the user asked for already happened.
 */
export async function deleteFit(fitId: string): Promise<void> {
  const { data: photoRows, error: readError } = await supabase
    .from('fit_wears')
    .select('photo_path, photo_thumb_path')
    .eq('fit_id', fitId)
    .not('photo_path', 'is', null);

  if (readError) {
    classify(readError);
  }

  const { error } = await supabase.from('fits').update({ deleted_at: new Date().toISOString() }).eq('id', fitId);

  if (error) {
    classify(error);
  }

  const rows = (photoRows ?? []) as { photo_path: string | null; photo_thumb_path: string | null }[];
  const paths = rows.flatMap((row) =>
    row.photo_path && row.photo_thumb_path ? [row.photo_path, row.photo_thumb_path] : [],
  );
  if (paths.length === 0) {
    return;
  }

  const { error: clearError } = await supabase
    .from('fit_wears')
    .update({ photo_path: null, photo_thumb_path: null, photo_thumbhash: null })
    // Only the photos read above (every file name is unique): one saved or
    // replaced since then keeps its columns, rather than losing them while
    // its files stay behind.
    .in('photo_path', rows.map((row) => row.photo_path));

  if (clearError) {
    // The rows still point at the files, so keep them rather than leave a
    // row pointing at nothing.
    Sentry.captureException(clearError);
    return;
  }

  await deleteWearPhotoFiles(paths);
}

/** How many of the Fit's wears have a photo, for its delete confirmation. Counts on the server; no rows come back. */
export async function countFitWearPhotos(fitId: string): Promise<number> {
  const { count, error } = await supabase
    .from('fit_wears')
    .select('id', { count: 'exact', head: true })
    .eq('fit_id', fitId)
    .not('photo_path', 'is', null);

  if (error) {
    classify(error);
  }

  return count ?? 0;
}
