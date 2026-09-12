import { supabase } from '@/lib/supabase';
import { SignUpError, isNoConnectionError } from '@/lib/auth/errors';

export type UpdateProfileInput = {
  displayName: string;
  avatarPath?: string;
};

/** Single write path for both onboarding and Profile edit. */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<void> {
  const update: { display_name: string; avatar_path?: string } = {
    display_name: input.displayName.trim(),
  };
  if (input.avatarPath) {
    update.avatar_path = input.avatarPath;
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', userId);

  if (error) {
    if (isNoConnectionError(error)) {
      throw new SignUpError('no_connection', error.message);
    }
    throw error;
  }
}
