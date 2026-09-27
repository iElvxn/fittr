import { ActionSheetIOS } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/observability/sentry';
import { toThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';
import { wearPhotoPaths, type WearPhoto, type WearRef } from './wearRef';

export type { WearPhoto, WearRef } from './wearRef';

/**
 * Story 5.4: the one module that reads or writes wear photos -- the
 * `ImageStore` seam (NFR8) for the private `wear-photos` bucket
 * (`0013_wear_photos.sql`). Swapping storage later (e.g. R2) means changing
 * only this file.
 */
export const WEAR_PHOTO_BUCKET = 'wear-photos';

/** Never upload the original: 1080px on the long edge is plenty for a phone screen. */
const PHOTO_LONG_EDGE = 1080;
/** Tiles are at most ~80pt wide, so 240px covers 3x screens. */
const THUMB_LONG_EDGE = 240;
const WEBP_QUALITY = 0.75;
const CONTENT_TYPE = 'image/webp';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export type ProcessedWearPhoto = { uri: string; thumbUri: string; thumbhash: string | null };

/**
 * Re-encodes on the device: a 1080px WebP and a 240px WebP thumbnail, plus
 * a thumbhash placeholder. Re-encoding also drops the original's EXIF, so a
 * photo's GPS location never leaves the phone.
 */
export async function processWearPhoto(uri: string): Promise<ProcessedWearPhoto> {
  const photo = await encodeWebp(uri, PHOTO_LONG_EDGE);
  const thumb = await encodeWebp(photo.uri, THUMB_LONG_EDGE);

  let thumbhash: string | null = null;
  try {
    thumbhash = await Image.generateThumbhashAsync(thumb.uri);
  } catch (error) {
    // Only a placeholder -- the photo is still worth saving without one.
    Sentry.captureException(error);
  }

  return { uri: photo.uri, thumbUri: thumb.uri, thumbhash };
}

/** Resizes so the long edge is `longEdge`, never upscaling, and always re-encodes. */
async function encodeWebp(uri: string, longEdge: number) {
  const image = await ImageManipulator.manipulate(uri).renderAsync();
  const options = { format: SaveFormat.WEBP, compress: WEBP_QUALITY };

  if (Math.max(image.width, image.height) <= longEdge) {
    return image.saveAsync(options);
  }

  const resized = await ImageManipulator.manipulate(image)
    .resize(image.width >= image.height ? { width: longEdge } : { height: longEdge })
    .renderAsync();
  return resized.saveAsync(options);
}

export type WearPhotoSource = 'camera' | 'library';

/** The native camera-or-library sheet, same pattern as Fit detail's Delete. Resolves null on Cancel. */
export function chooseWearPhotoSource(): Promise<WearPhotoSource | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Add a photo of what you wore',
        options: ['Take Photo', 'Choose from Library', 'Cancel'],
        cancelButtonIndex: 2,
      },
      (buttonIndex) => resolve(buttonIndex === 0 ? 'camera' : buttonIndex === 1 ? 'library' : null),
    );
  });
}

export type PickWearPhotoResult = { uri: string } | { cancelled: true } | { denied: true };

/**
 * Full quality and no crop: `processWearPhoto` does the only resize, so
 * compressing here too would just degrade it twice. The library uses the
 * system picker, which needs no permission; only the camera asks.
 */
export async function pickWearPhoto(source: WearPhotoSource): Promise<PickWearPhotoResult> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: 'images',
    quality: 1,
    allowsEditing: false,
    exif: false,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { denied: true };
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  if (result.canceled || !result.assets?.[0]) {
    return { cancelled: true };
  }
  return { uri: result.assets[0].uri };
}

function classify(error: unknown): never {
  if (isNoConnectionError(error)) {
    throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
  }
  throw error;
}

function photoColumns(photo: WearPhoto | null) {
  return {
    photo_path: photo?.path ?? null,
    photo_thumb_path: photo?.thumbPath ?? null,
    photo_thumbhash: photo?.thumbhash ?? null,
  };
}

/** Never `upsert`: every save has a new name, and the bucket has no UPDATE policy. */
async function upload(path: string, localUri: string) {
  const body = await new File(localUri).arrayBuffer();
  const { error } = await supabase.storage.from(WEAR_PHOTO_BUCKET).upload(path, body, { contentType: CONTENT_TYPE });
  if (error) {
    classify(error);
  }
}

/** Points the wear at `photo` (or clears it). An update that matched no row is a failure too. */
async function updateWearRow(wearId: string, photo: WearPhoto | null) {
  const { data, error } = await supabase.from('fit_wears').update(photoColumns(photo)).eq('id', wearId).select('id');
  if (error) {
    classify(error);
  }
  if (!data?.length) {
    throw new Error(`Wear ${wearId} not found`);
  }
}

/**
 * Adds or replaces a wear's photo. Order matters so nothing is ever
 * orphaned or lost: upload both files under a fresh name, then point the
 * row at them, and only then delete the old files. A failed upload or row
 * update deletes what was just uploaded and leaves the old photo intact.
 */
export async function saveWearPhoto(userId: string, wear: WearRef, uri: string): Promise<WearPhoto> {
  const processed = await processWearPhoto(uri);
  try {
    return await uploadAndPoint(userId, wear, processed);
  } finally {
    // The re-encoded files are only needed for the upload.
    deleteLocalFile(processed.uri);
    deleteLocalFile(processed.thumbUri);
  }
}

function deleteLocalFile(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // Already gone, or never written -- the OS clears the cache anyway.
  }
}

async function uploadAndPoint(userId: string, wear: WearRef, processed: ProcessedWearPhoto): Promise<WearPhoto> {
  const name = Crypto.randomUUID();
  const photo: WearPhoto = {
    path: `${userId}/${wear.id}/${name}.webp`,
    thumbPath: `${userId}/${wear.id}/${name}_thumb.webp`,
    thumbhash: processed.thumbhash,
  };

  await upload(photo.path, processed.uri);
  try {
    await upload(photo.thumbPath, processed.thumbUri);
  } catch (error) {
    await deleteWearPhotoFiles([photo.path]);
    throw error;
  }

  try {
    await updateWearRow(wear.id, photo);
  } catch (error) {
    await deleteWearPhotoFiles(wearPhotoPaths(photo));
    throw error;
  }

  if (wear.photo) {
    await deleteWearPhotoFiles(wearPhotoPaths(wear.photo));
  }
  return photo;
}

/** Clears the row first, so a failure never leaves it pointing at deleted files. */
export async function removeWearPhoto(wear: WearRef): Promise<void> {
  if (!wear.photo) {
    return;
  }
  await updateWearRow(wear.id, null);
  await deleteWearPhotoFiles(wearPhotoPaths(wear.photo));
}

/**
 * Best-effort cleanup once nothing points at the files any more. Never
 * throws: the user's action already succeeded, so a failure here is only
 * reported (an orphaned file costs storage, not correctness).
 */
export async function deleteWearPhotoFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  try {
    const { error } = await supabase.storage.from(WEAR_PHOTO_BUCKET).remove(paths);
    if (error) {
      Sentry.captureException(error);
    }
  } catch (error) {
    Sentry.captureException(error);
  }
}

/**
 * One signed-URL request for every photo on screen, shaped like
 * `useThumbnailUrls`. Callers pass thumbnails for tiles and a full path only
 * from the day sheet. The URL changes each time it's re-signed, so images
 * cache on the storage path (`cacheKey`), which never changes for a file.
 */
export function useWearPhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: ['wearPhotoUrls', [...paths].sort()],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(WEAR_PHOTO_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);
      if (error) {
        throw error;
      }
      return toThumbnailUrlMap(data);
    },
    enabled: paths.length > 0,
    staleTime: (SIGNED_URL_EXPIRY_SECONDS - 60) * 1000,
  });
}
