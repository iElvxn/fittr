import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { WardrobeItemCategory } from './addItem';

/**
 * Kept in Supabase's native snake_case (not mapped to camelCase) to match
 * `app/profile.tsx`'s existing pattern of reading `profile.avatar_path`
 * straight off the query result.
 */
export type WardrobeItemRow = {
  id: string;
  category: WardrobeItemCategory;
  name: string | null;
  brand: string | null;
  notes: string | null;
  color_hex: string | null;
  cutout_path: string;
  thumb_path: string;
  created_at: string;
};

/**
 * Grid data source: live Supabase read, no local cache-of-record, per the
 * epic's direct-Supabase architecture. `deleted_at is null` plus `user_id`
 * are both covered by 0003_wardrobe_items.sql's partial index, so this reads
 * as an index-only scan.
 */
export function useWardrobeItems(userId: string | undefined) {
  return useQuery({
    queryKey: ['wardrobeItems', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wardrobe_items')
        .select('id, category, name, brand, notes, color_hex, cutout_path, thumb_path, created_at')
        .eq('user_id', userId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data as WardrobeItemRow[];
    },
    enabled: Boolean(userId),
  });
}

/**
 * Pure and client-side: filtering re-queries nothing, it just narrows the
 * already-fetched list, so a chip tap is instant with no network round trip.
 */
export function filterByCategory(
  items: WardrobeItemRow[],
  category: WardrobeItemCategory | 'all',
): WardrobeItemRow[] {
  if (category === 'all') {
    return items;
  }
  return items.filter((item) => item.category === category);
}

/**
 * Pure and client-side, same as `filterByCategory` (and meant to be chained
 * with it): case-insensitive substring match on name or brand only -- no
 * category, color or notes -- over the already-fetched list. A blank or
 * whitespace-only query means "no search" and returns the list unchanged.
 */
export function searchItems(items: WardrobeItemRow[], query: string): WardrobeItemRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }
  return items.filter(
    (item) =>
      (item.name ?? '').toLowerCase().includes(needle) || (item.brand ?? '').toLowerCase().includes(needle),
  );
}
