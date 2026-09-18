import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type FitRow = {
  id: string;
  name: string;
  cover_path: string | null;
  updated_at: string;
};

/**
 * Mirrors `lib/wardrobe/listItems.ts`'s `useWardrobeItems` exactly: live
 * Supabase read, no local cache-of-record. Shared by the Fits tab's list and
 * the Fit detail screen (`items?.find(f => f.id === id)`), same "the
 * already-cached list is the single source of truth" convention as
 * `app/item/[id].tsx`. Ordered by `updated_at desc` (not `created_at`) so an
 * edited Fit resurfaces at the top, since `0004_fits.sql`'s trigger bumps
 * `updated_at` on every save, including an edit's re-save.
 */
export function useFits(userId: string | undefined) {
  return useQuery({
    queryKey: ['fits', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fits')
        .select('id, name, cover_path, updated_at')
        .eq('user_id', userId as string)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data as FitRow[];
    },
    enabled: Boolean(userId),
  });
}
