/**
 * `uploadCover` always writes to the same storage path (`upsert: true`,
 * keyed off the Fit's own unchanging id), so the signed URL for a Fit's
 * cover is identical before and after an edit -- on its own it can't
 * distinguish a freshly re-saved cover from the one before it, and both
 * `expo-image`'s cache and Storage's own CDN key off the exact URL string.
 * Appending `updated_at` (bumped by `0004_fits.sql`'s trigger on every
 * save) forces a fresh fetch whenever the underlying file actually changed.
 *
 * Its own file, separate from `listFits.ts` -- that module imports
 * `@/lib/supabase`, which pulls in native `AsyncStorage` and breaks under
 * Jest unless mocked; this is a pure string function both screens need
 * directly, with no reason to drag that import along.
 */
export function cacheBustedCoverUrl(signedUrl: string, updatedAt: string): string {
  return `${signedUrl}${signedUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(updatedAt)}`;
}
