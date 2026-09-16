import type { RefObject } from 'react';
import { Camera, type CameraView } from 'expo-camera';

import { WardrobeItemError, CAMERA_PERMISSION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from './errors';

export type CameraRef = RefObject<CameraView | null>;

/**
 * Explicit imperative request, mirroring 2.1's `captureFromCamera` -- kept
 * as a plain async function (not the `useCameraPermissions` hook) so the
 * denial path is a unit-testable throw like every other capture error in
 * this app, rather than a hook-only state the UI has to branch on.
 */
export async function ensureCameraPermission(): Promise<void> {
  const permission = await Camera.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new WardrobeItemError('permission_denied', CAMERA_PERMISSION_MESSAGE);
  }
}

/**
 * One shutter press -- the camera view stays mounted across calls (rapid
 * capture), unlike `expo-image-picker`'s one-shot `launchCameraAsync`.
 */
export async function capturePhoto(cameraRef: CameraRef): Promise<string> {
  const photo = await cameraRef.current?.takePictureAsync({ quality: 1, skipProcessing: true });
  if (!photo?.uri) {
    throw new WardrobeItemError('unknown', UNKNOWN_ERROR_MESSAGE);
  }
  return photo.uri;
}
