import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  })),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: jest.fn() },
    from: jest.fn(),
  },
}));

import { uploadItem, insertWardrobeItem } from '@/lib/wardrobe/addItem';
import { supabase } from '@/lib/supabase';

const CUTOUT_PATH = 'user-1/items/item-1/cutout.png';
const THUMB_PATH = 'user-1/items/item-1/thumb.webp';

describe('uploadItem', () => {
  it('uploads cutout.png and thumb.webp with upsert', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    const paths = await uploadItem('user-1', 'item-1', 'file://cutout.png', 'file://thumb.webp');

    expect(supabase.storage.from).toHaveBeenCalledWith('wardrobe');
    expect(upload).toHaveBeenCalledWith(
      CUTOUT_PATH,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/png', upsert: true }),
    );
    expect(upload).toHaveBeenCalledWith(
      THUMB_PATH,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/webp', upsert: true }),
    );
    expect(paths).toEqual({ cutoutPath: CUTOUT_PATH, thumbPath: THUMB_PATH });
  });

  it('rolls back the successful upload when the other one fails', async () => {
    const upload = jest.fn().mockImplementation((path: string) => {
      if (path === THUMB_PATH) {
        return Promise.resolve({ error: new Error('boom') });
      }
      return Promise.resolve({ error: null });
    });
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });

    await expect(
      uploadItem('user-1', 'item-1', 'file://cutout.png', 'file://thumb.webp'),
    ).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledWith([CUTOUT_PATH, THUMB_PATH]);
  });

  it('classifies a no-connection failure', async () => {
    const upload = jest.fn().mockResolvedValue({
      error: new AuthRetryableFetchError('network request failed', 0),
    });
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });

    await expect(
      uploadItem('user-1', 'item-1', 'file://cutout.png', 'file://thumb.webp'),
    ).rejects.toMatchObject({ kind: 'no_connection' });
  });
});

describe('insertWardrobeItem', () => {
  it('upserts on id so a retried save is idempotent', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    await insertWardrobeItem('user-1', 'item-1', {
      category: 'top',
      colorHex: '#000000',
      cutoutPath: CUTOUT_PATH,
      thumbPath: THUMB_PATH,
    });

    expect(supabase.from).toHaveBeenCalledWith('wardrobe_items');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', user_id: 'user-1', category: 'top' }),
      { onConflict: 'id' },
    );
  });

  it('classifies a no-connection failure', async () => {
    const upsert = jest.fn().mockResolvedValue({
      error: new AuthRetryableFetchError('network request failed', 0),
    });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    await expect(
      insertWardrobeItem('user-1', 'item-1', {
        category: 'top',
        colorHex: null,
        cutoutPath: CUTOUT_PATH,
        thumbPath: THUMB_PATH,
      }),
    ).rejects.toMatchObject({ kind: 'no_connection' });
  });
});
