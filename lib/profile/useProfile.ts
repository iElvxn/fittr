import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/** Shared by the Profile screen and Home's avatar button -- same `queryKey`, so both read/invalidate one cache entry. */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_path')
        .eq('id', userId as string)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: Boolean(userId),
  });
}
