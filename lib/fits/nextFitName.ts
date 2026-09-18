import { supabase } from '@/lib/supabase';

/**
 * Default Fit name shown pre-filled in `SaveFitSheet` -- "Fit {n}" where n is
 * one more than the user's current count of saved (non-deleted) Fits. Read
 * once when the sheet opens rather than kept live, since a race with another
 * save in flight would only ever produce a harmlessly-skipped number, never a
 * collision (Fit names aren't unique).
 */
export async function getNextFitName(userId: string): Promise<string> {
  const { count, error } = await supabase
    .from('fits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    throw error;
  }

  return `Fit ${(count ?? 0) + 1}`;
}
