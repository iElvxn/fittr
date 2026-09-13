import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import { SignUpError, isNoConnectionError } from '@/lib/auth/errors';

export type PickAvatarResult = { uri: string } | { cancelled: true };

/** Library-only (no camera -- that's Epic 2 scope). Square crop to match the avatar's display shape. */
export async function pickAvatar(): Promise<PickAvatarResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { cancelled: true };
  }

  return { uri: result.assets[0].uri };
}

/**
 * Uploads to a fixed filename under the user's own folder (`{userId}/avatar.jpg`)
 * with `upsert: true`, so changing the avatar always overwrites rather than
 * accumulating objects -- no client-side delete is ever needed.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/avatar.jpg`;
  const file = new File(localUri);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage.from('wardrobe').upload(path, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) {
    if (isNoConnectionError(error)) {
      throw new SignUpError('no_connection', error.message);
    }
    throw error;
  }

  return path;
}
