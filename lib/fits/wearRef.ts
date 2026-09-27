/**
 * Story 5.4: the photo attached to one wear (`fit_wears` row), as the app
 * uses it. Pure types and mapping only -- kept apart from `wearPhoto.ts` so
 * the wear reads (`plannedFits.ts`, `wornFitIds.ts`) don't load the native
 * image modules that the upload path needs.
 */
export type WearPhoto = {
  /** Full 1080px WebP in the `wear-photos` bucket. Only the day sheet loads it. */
  path: string;
  /** 240px WebP beside it. Every tile loads this, never `path`. */
  thumbPath: string;
  /** Placeholder shown while the thumbnail loads, or null if none was made. */
  thumbhash: string | null;
};

/** A wear and its photo, if any -- what a photo write needs to know about the row. */
export type WearRef = {
  id: string;
  photo: WearPhoto | null;
};

/** The `fit_wears` columns a wear read selects for its photo. */
export const WEAR_PHOTO_COLUMNS = 'photo_path, photo_thumb_path, photo_thumbhash';

export type WearPhotoRow = {
  id: string;
  photo_path: string | null;
  photo_thumb_path: string | null;
  photo_thumbhash: string | null;
};

/** 0013's check keeps both paths set or both null, so either one decides. */
export function toWearRef(row: WearPhotoRow): WearRef {
  return {
    id: row.id,
    photo:
      row.photo_path && row.photo_thumb_path
        ? { path: row.photo_path, thumbPath: row.photo_thumb_path, thumbhash: row.photo_thumbhash ?? null }
        : null,
  };
}

/** Key for one Fit worn on one day, as the Planner's wear reads index them. */
export function wearKey(fitId: string, date: string) {
  return `${fitId}|${date}`;
}

/** Both files of a photo, as one delete call takes them. */
export function wearPhotoPaths(photo: WearPhoto): string[] {
  return [photo.path, photo.thumbPath];
}
