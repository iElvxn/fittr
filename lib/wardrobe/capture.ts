import * as ImagePicker from 'expo-image-picker';

export type CaptureSource = 'camera' | 'library';

export type PickWardrobePhotosResult = { uris: string[] } | { cancelled: true };

/**
 * Multi-select (`allowsMultipleSelection`, no `selectionLimit`) so picking
 * one photo or many both go through this same call -- single-item is just
 * the batch-of-one case. No aspect lock (unlike `pickAvatar`'s square crop):
 * a clothing item's silhouette isn't square, and letting the user crop here
 * risks cutting off part of the garment before background removal ever sees
 * the full photo. The on-device pipeline's resize step normalizes size, not
 * shape.
 *
 * Live single-shot/rapid camera capture is `rapidCamera.ts` -- this module
 * only covers the library entry point (`launchCameraAsync`'s single-shot,
 * no-live-view capture from Story 2.1 is superseded by it).
 */
export async function pickFromLibrary(options?: { allowsMultipleSelection?: boolean }): Promise<PickWardrobePhotosResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    allowsMultipleSelection: options?.allowsMultipleSelection ?? true,
    quality: 1,
  });

  if (result.canceled || !result.assets?.length) {
    return { cancelled: true };
  }

  return { uris: result.assets.map((asset) => asset.uri) };
}
