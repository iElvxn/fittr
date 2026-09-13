import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * The `wardrobe` bucket is private (per the epic's "all data private
 * per-user" principle), so display always goes through a signed URL --
 * `createSignedUrl` itself enforces the SELECT RLS policy for the
 * requesting user -- never a public URL.
 */
export function useAvatarUrl(avatarPath: string | null | undefined) {
  return useQuery({
    queryKey: ['avatarUrl', avatarPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('wardrobe')
        .createSignedUrl(avatarPath as string, SIGNED_URL_EXPIRY_SECONDS);
      if (error) {
        throw error;
      }
      return data.signedUrl;
    },
    enabled: Boolean(avatarPath),
    // Refetch a bit before the signed URL actually expires, so a
    // long-mounted screen doesn't end up holding an expired URL.
    staleTime: (SIGNED_URL_EXPIRY_SECONDS - 60) * 1000,
  });
}
