import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/** `null` marks a path whose signed-URL request failed -- consumers render a fallback for it. */
export type ThumbnailUrlMap = Record<string, string | null>;

/**
 * `createSignedUrls` (plural) reports failures per-path in its `data` array
 * rather than failing the whole call -- pulled out as its own function so the
 * partial-failure case (one broken path among many) is testable without
 * mocking the network.
 */
export function toThumbnailUrlMap(
  results: { path: string | null; error: string | null; signedUrl: string | null }[],
): ThumbnailUrlMap {
  const map: ThumbnailUrlMap = {};
  for (const result of results) {
    if (result.path === null) {
      continue;
    }
    map[result.path] = result.error ? null : result.signedUrl;
  }
  return map;
}

/**
 * One bulk request for every visible thumbnail instead of one signed-URL
 * request per grid cell -- the `wardrobe` bucket is private, so display
 * always goes through a signed URL, same as `lib/profile/avatarUrl.ts`.
 */
export function useThumbnailUrls(paths: string[]) {
  return useQuery({
    // Sorted, not the raw array -- `items` gets a new array reference on
    // every refetch (including a no-op pull-to-refresh), and an unsorted key
    // would treat that as a brand-new set of paths, re-requesting signed
    // URLs for images that haven't actually changed.
    queryKey: ['thumbnailUrls', [...paths].sort()],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('wardrobe')
        .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);
      if (error) {
        throw error;
      }
      return toThumbnailUrlMap(data);
    },
    enabled: paths.length > 0,
    // Refetch a bit before the signed URLs actually expire, matching
    // `useAvatarUrl`'s convention.
    staleTime: (SIGNED_URL_EXPIRY_SECONDS - 60) * 1000,
  });
}
