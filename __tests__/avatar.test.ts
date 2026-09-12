import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  })),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: jest.fn() },
  },
}));

import * as ImagePicker from 'expo-image-picker';
import { pickAvatar, uploadAvatar } from '@/lib/profile/avatar';
import { supabase } from '@/lib/supabase';

const launchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;

describe('pickAvatar', () => {
  it('returns the picked uri', async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://picked.jpg' }],
    });

    await expect(pickAvatar()).resolves.toEqual({ uri: 'file://picked.jpg' });
  });

  it('returns cancelled when the user backs out', async () => {
    launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickAvatar()).resolves.toEqual({ cancelled: true });
  });
});

describe('uploadAvatar', () => {
  it('uploads to {userId}/avatar.jpg with upsert and returns the path', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    const path = await uploadAvatar('user-1', 'file://local.jpg');

    expect(supabase.storage.from).toHaveBeenCalledWith('wardrobe');
    expect(upload).toHaveBeenCalledWith(
      'user-1/avatar.jpg',
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    );
    expect(path).toBe('user-1/avatar.jpg');
  });

  it('classifies a no-connection failure', async () => {
    const upload = jest.fn().mockResolvedValue({
      error: new AuthRetryableFetchError('network request failed', 0),
    });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    await expect(uploadAvatar('user-1', 'file://local.jpg')).rejects.toMatchObject({
      kind: 'no_connection',
    });
  });

  it('rethrows other errors', async () => {
    const upload = jest.fn().mockResolvedValue({ error: new Error('boom') });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    await expect(uploadAvatar('user-1', 'file://local.jpg')).rejects.toThrow('boom');
  });
});

