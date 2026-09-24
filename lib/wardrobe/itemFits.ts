import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { FitError, isNoConnectionError, NO_CONNECTION_MESSAGE } from '@/lib/fits/errors';

/**
 * The distinct ids of every Fit that places this piece, in first-seen order
 * (a Fit can place the same piece more than once). Read-only, and no
 * `user_id` filter: `fit_items`' RLS already scopes rows through
 * `fits.user_id`. Soft-deleted Fits are still returned here -- callers join
 * against `useFits`' cached (live-only) list, which drops them.
 */
export async function getItemFitIds(itemId: string): Promise<string[]> {
  const { data, error } = await supabase.from('fit_items').select('fit_id').eq('item_id', itemId);

  if (error) {
    // Classified the same way `lib/fits/getFitItems.ts` does, so the screen
    // can tell a no-connection failure (not reported) from anything else.
    if (isNoConnectionError(error)) {
      throw new FitError('no_connection', NO_CONNECTION_MESSAGE);
    }
    throw error;
  }

  return [...new Set(((data ?? []) as { fit_id: string }[]).map((row) => row.fit_id))];
}

export function useItemFitIds(itemId: string | undefined) {
  return useQuery({
    queryKey: ['itemFits', itemId],
    queryFn: () => getItemFitIds(itemId as string),
    enabled: Boolean(itemId),
  });
}
