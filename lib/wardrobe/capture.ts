import * as ImagePicker from 'expo-image-picker';

import { WardrobeItemError, CAMERA_PERMISSION_MESSAGE } from './errors';

export type CaptureSource = 'camera' | 'library';

export type PickWardrobePhotoResult = { uri: string } | { cancelled: true };

/**
 * No aspect lock (unlike `pickAvatar`'s square crop): a clothing item's
 * silhouette isn't square, and letting the user crop here risks cutting off
 * part of the garment before background removal ever sees the full photo.
 * The on-device pipeline's resize step normalizes size, not shape.
 */
export async function pickFromLibrary(): Promise<PickWardrobePhotoResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { cancelled: true };
  }

  return { uri: result.assets[0].uri };
}

/**
 * Single-shot capture -- `expo-camera` isn't needed since there's no live
 * viewfinder UI in this story (Story 2.2's rapid-capture mode is what needs
 * that).
 *
 * Unlike `launchImageLibraryAsync` (which prompts for photo-library access
 * itself as needed, via `PHPickerViewController`), `launchCameraAsync`
 * requires camera permission to already be granted -- it never requests it
 * on the caller's behalf, and rejects with `MissingCameraPermissionException`
 * instead of prompting if it isn't. So the request has to happen here,
 * explicitly, before ever calling it.
 */
export async function captureFromCamera(): Promise<PickWardrobePhotoResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new WardrobeItemError('permission_denied', CAMERA_PERMISSION_MESSAGE);
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { cancelled: true };
  }

  return { uri: result.assets[0].uri };
}
