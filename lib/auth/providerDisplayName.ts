import { supabase } from '@/lib/supabase';

/**
 * Best-effort upgrade of the placeholder `display_name` set by the
 * `handle_new_user` trigger (0001_profiles.sql), using the identity
 * provider's real name when Apple/Google supplied one. Never throws:
 * the account is already fully created via the trigger by the time this
 * runs, and Story 1.3's onboarding overwrites `display_name` regardless —
 * a failure here (network blip, RLS edge case) shouldn't fail sign-up.
 */
export async function applyProviderDisplayName(
  userId: string,
  providerNameClaim: string | null,
): Promise<void> {
  if (!providerNameClaim) {
    return;
  }

  try {
    await supabase.from('profiles').update({ display_name: providerNameClaim }).eq('id', userId);
  } catch {
    // Best-effort — see doc comment above.
  }
}
