import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from './errors';

/** `fitId` becomes part of a file name -- UUID-shaped only, so it can never escape `Paths.cache`. */
const SAFE_FIT_ID = /^[A-Za-z0-9-]+$/;

/**
 * `downloadFileAsync` is native, not `fetch` -- on iOS a connectivity
 * failure rejects as "Unable to download a file: <NSURLError
 * localizedDescription>", which `isNoConnectionError`'s fetch/Supabase
 * patterns don't match. These are the NSURLError descriptions for being
 * offline / unreachable.
 */
const NATIVE_OFFLINE_MESSAGE =
  /internet connection appears to be offline|network connection was lost|could not connect to the server|hostname could not be found|request timed out/i;

function isDownloadConnectionError(error: unknown): boolean {
  if (isNoConnectionError(error)) {
    return true;
  }
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return NATIVE_OFFLINE_MESSAGE.test(message);
}

/**
 * Story 4.3: hands a Fit's already-rendered collage (`cover_path`, via its
 * signed URL) to the native iOS share sheet. Downloads to a local `.png`
 * first rather than sharing the URL itself -- the signed URL would expire
 * and leak a private-bucket link, and iOS only treats a local `file://`
 * URL as the image item Photos/Messages/AirDrop expect.
 * `downloadFileAsync` rejects on a non-2xx and creates no file, so the
 * sheet can never receive a partial/placeholder image.
 */
export async function shareFitCover(fitId: string, coverUrl: string): Promise<void> {
  if (!SAFE_FIT_ID.test(fitId)) {
    throw new Error(`Refusing to share Fit with unsafe id: ${JSON.stringify(fitId)}`);
  }

  let file: File;
  try {
    file = await File.downloadFileAsync(coverUrl, new File(Paths.cache, `fit-${fitId}.png`), { idempotent: true });
  } catch (error) {
    if (isDownloadConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  try {
    // Resolves on both share and dismiss -- a dismissed sheet is a normal outcome, not an error.
    await Share.share({ url: file.uri });
  } finally {
    // Best-effort: a leftover copy in the OS-purgeable cache is harmless,
    // and a cleanup failure must never turn a successful share into an error.
    try {
      file.delete();
    } catch {
      // ignore
    }
  }
}
