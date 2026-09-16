jest.mock('expo-camera', () => ({
  Camera: { requestCameraPermissionsAsync: jest.fn() },
}));

import { Camera } from 'expo-camera';
import { ensureCameraPermission, capturePhoto, type CameraRef } from '@/lib/wardrobe/rapidCamera';
import { WardrobeItemError } from '@/lib/wardrobe/errors';

const requestCameraPermissionsAsync = Camera.requestCameraPermissionsAsync as jest.Mock;

describe('ensureCameraPermission', () => {
  it('resolves when permission is granted', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });

    await expect(ensureCameraPermission()).resolves.toBeUndefined();
  });

  it('throws a permission_denied WardrobeItemError when permission is refused', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(ensureCameraPermission()).rejects.toMatchObject({
      kind: 'permission_denied',
    });
    await expect(ensureCameraPermission()).rejects.toBeInstanceOf(WardrobeItemError);
  });
});

describe('capturePhoto', () => {
  function refWith(takePictureAsync: jest.Mock | undefined): CameraRef {
    return { current: takePictureAsync ? ({ takePictureAsync } as never) : null };
  }

  it('returns the captured photo\'s uri', async () => {
    const takePictureAsync = jest.fn().mockResolvedValue({ uri: 'file://shot-1.jpg' });

    await expect(capturePhoto(refWith(takePictureAsync))).resolves.toBe('file://shot-1.jpg');
  });

  it('throws when the camera ref has no attached view', async () => {
    await expect(capturePhoto(refWith(undefined))).rejects.toBeInstanceOf(WardrobeItemError);
  });

  it('throws when takePictureAsync resolves with no uri', async () => {
    const takePictureAsync = jest.fn().mockResolvedValue({});

    await expect(capturePhoto(refWith(takePictureAsync))).rejects.toBeInstanceOf(WardrobeItemError);
  });
});
