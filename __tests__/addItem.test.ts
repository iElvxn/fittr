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

import { uploadItem, insertWardrobeItem, saveBatch } from '@/lib/wardrobe/addItem';
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

describe('saveBatch', () => {
  function pathsFor(itemId: string) {
    return {
      cutout: `user-1/items/${itemId}/cutout.png`,
      thumb: `user-1/items/${itemId}/thumb.webp`,
    };
  }

  const ITEM_1 = { itemId: 'item-1', cutoutUri: 'file://c1.png', thumbUri: 'file://t1.webp', category: 'top' as const, colorHex: '#111111' };
  const ITEM_2 = { itemId: 'item-2', cutoutUri: 'file://c2.png', thumbUri: 'file://t2.webp', category: 'shoes' as const, colorHex: '#222222' };

  it('uploads and inserts every item in order', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const deleteEq = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    (supabase.from as jest.Mock).mockReturnValue({ upsert, delete: jest.fn().mockReturnValue({ eq: deleteEq }) });

    await saveBatch('user-1', [ITEM_1, ITEM_2]);

    expect(upload).toHaveBeenCalledTimes(4);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'item-1' }), { onConflict: 'id' });
    expect(upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'item-2' }), { onConflict: 'id' });
    expect(remove).not.toHaveBeenCalled();
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it('rolls back every already-saved item when a later one fails, and cleans the failing item\'s own storage', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const upsert = jest.fn().mockImplementation((row: { id: string }) => {
      if (row.id === 'item-2') {
        return Promise.resolve({ error: new Error('boom') });
      }
      return Promise.resolve({ error: null });
    });
    const deleteEq = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    (supabase.from as jest.Mock).mockReturnValue({ upsert, delete: jest.fn().mockReturnValue({ eq: deleteEq }) });

    await expect(saveBatch('user-1', [ITEM_1, ITEM_2])).rejects.toThrow('boom');

    // item-1 fully committed (upload + insert succeeded) then rolled back: storage removed + row deleted.
    expect(remove).toHaveBeenCalledWith([pathsFor('item-1').cutout, pathsFor('item-1').thumb]);
    expect(deleteEq).toHaveBeenCalledTimes(1);
    expect(deleteEq).toHaveBeenCalledWith('id', 'item-1');
    // item-2's own uploaded storage (its insert failed after its upload succeeded) is also cleaned, with no row to delete.
    expect(remove).toHaveBeenCalledWith([pathsFor('item-2').cutout, pathsFor('item-2').thumb]);
  });

  it('never uploads items after the one that failed', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const upsert = jest.fn().mockImplementation((row: { id: string }) => {
      if (row.id === 'item-1') {
        return Promise.resolve({ error: new Error('boom') });
      }
      return Promise.resolve({ error: null });
    });
    const deleteEq = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    (supabase.from as jest.Mock).mockReturnValue({ upsert, delete: jest.fn().mockReturnValue({ eq: deleteEq }) });

    await expect(saveBatch('user-1', [ITEM_1, ITEM_2])).rejects.toThrow('boom');

    expect(upload).toHaveBeenCalledTimes(2); // only item-1's cutout+thumb, never item-2's
  });
});
