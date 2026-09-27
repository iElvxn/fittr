import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { toWearRef, WEAR_PHOTO_COLUMNS, type WearPhoto, type WearPhotoRow } from './wearRef';

/** One wear of a Fit that has a photo -- a tile in Fit detail's "Worn" strip. */
export type FitWearPhoto = {
  /** The wear's id. */
  id: string;
  /** The day it was worn, `YYYY-MM-DD`. */
  wornOn: string;
  photo: WearPhoto;
};

/**
 * Story 5.5: every wear of one Fit that has a photo, newest first. RLS
 * scopes the rows to the signed-in user. No cap -- the strip shows them all,
 * and signs their thumbnails in one batch.
 */
export async function getFitWearPhotos(fitId: string): Promise<FitWearPhoto[]> {
  const { data, error } = await supabase
    .from('fit_wears')
    .select(`id, worn_on, ${WEAR_PHOTO_COLUMNS}`)
    .eq('fit_id', fitId)
    .not('photo_path', 'is', null)
    .order('worn_on', { ascending: false });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return ((data ?? []) as (WearPhotoRow & { worn_on: string })[]).flatMap((row) => {
    const { id, photo } = toWearRef(row);
    return photo ? [{ id, wornOn: row.worn_on, photo }] : [];
  });
}

/**
 * Live Supabase read, like the other wear reads. `invalidateWearQueries`
 * refreshes it by the `['fitWearPhotos', userId]` prefix after every wear or
 * photo write, wherever it happened.
 */
export function useFitWearPhotos(userId: string | undefined, fitId: string | undefined) {
  return useQuery({
    queryKey: ['fitWearPhotos', userId, fitId],
    queryFn: () => getFitWearPhotos(fitId as string),
    enabled: Boolean(userId && fitId),
  });
}
