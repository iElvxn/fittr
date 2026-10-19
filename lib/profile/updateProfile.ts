import { supabase } from '@/lib/supabase';
import { Sentry } from '@/lib/observability/sentry';
import { SignUpError, isNoConnectionError } from '@/lib/auth/errors';

export type UpdateProfileInput = {
  displayName: string;
  /** A just-uploaded avatar (`uploadAvatar`) for the row to point at. */
  avatarPath?: string;
  /** The avatar the row points at before this save, deleted once it's replaced. */
  previousAvatarPath?: string | null;
};

/**
 * Single write path for both onboarding and Profile edit.
 *
 * A new avatar is a new file (`uploadAvatar`), so the old one is deleted
 * here, only after the row points at the new one -- same order as
 * `insertFit`'s previous-cover cleanup. If the server rejects the row
 * update instead, the just-uploaded file is deleted, so a failed save leaves
 * no orphan and the old avatar stays. Not on a no-connection error: the
 * update may have committed before the response was lost, and the row
 * would then point at a deleted file -- an orphan is the cheaper failure.
 */
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
    if (input.avatarPath) {
      await removeAvatarFile(input.avatarPath);
    }
    throw error;
  }

  if (input.avatarPath && input.previousAvatarPath && input.previousAvatarPath !== input.avatarPath) {
    await removeAvatarFile(input.previousAvatarPath);
  }
}

/**
 * Best-effort: never throws, so a cleanup failure can't turn a successful
 * save into an error or hide a failed save's own error. An orphaned file
 * costs storage, not correctness, so it's only reported.
 */
async function removeAvatarFile(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage.from('wardrobe').remove([path]);
    if (error) {
      Sentry.captureException(error);
    }
  } catch (error) {
    Sentry.captureException(error);
  }
}
