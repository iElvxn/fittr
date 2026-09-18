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

import { uploadCover, insertFit, type FitItemPlacement } from '@/lib/fits/saveFit';
import { supabase } from '@/lib/supabase';

const COVER_PATH = 'user-1/fits/fit-1/cover.png';

const ITEM: FitItemPlacement = {
  id: 'placement-1',
  wardrobeItemId: 'wardrobe-item-1',
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  zIndex: 1,
};

describe('uploadCover', () => {
  it('uploads cover.png with upsert', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    const coverPath = await uploadCover('user-1', 'fit-1', 'file://collage.png');

    expect(supabase.storage.from).toHaveBeenCalledWith('wardrobe');
    expect(upload).toHaveBeenCalledWith(
      COVER_PATH,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/png', upsert: true }),
    );
    expect(coverPath).toBe(COVER_PATH);
  });

  it('classifies a no-connection failure', async () => {
    const upload = jest.fn().mockResolvedValue({
      error: new AuthRetryableFetchError('offline', 0),
    });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    await expect(uploadCover('user-1', 'fit-1', 'file://collage.png')).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('rethrows any other upload error as-is', async () => {
    const upload = jest.fn().mockResolvedValue({ error: new Error('boom') });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload });

    await expect(uploadCover('user-1', 'fit-1', 'file://collage.png')).rejects.toThrow('boom');
  });
});

/**
 * `fit_items.delete().eq(...)` is itself awaitable (no further chaining) when
 * there are no surviving placements, or chains one more `.not(...)` when
 * there are -- this stub supports both call shapes so `insertFit`'s
 * orphan-cleanup step (which picks the shape based on the new placement
 * count) resolves either way.
 */
function mockFitItemsDeleteChain(result: { error: unknown } = { error: null }) {
  const not = jest.fn().mockResolvedValue(result);
  const builder = { not, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  const eq = jest.fn().mockReturnValue(builder);
  const del = jest.fn().mockReturnValue({ eq });
  return { del, eq, not };
}

describe('insertFit', () => {
  function mockSupabase({
    fitError,
    itemsError,
    cleanupError,
  }: {
    fitError: unknown;
    itemsError?: unknown;
    cleanupError?: unknown;
  }) {
    const fitsUpsert = jest.fn().mockResolvedValue({ error: fitError });
    const fitItemsUpsert = jest.fn().mockResolvedValue({ error: itemsError ?? null });
    const fitsUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const { del: fitItemsDelete, eq: fitItemsDeleteEq, not: fitItemsDeleteNot } = mockFitItemsDeleteChain({
      error: cleanupError ?? null,
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'fits') {
        return { upsert: fitsUpsert, update: fitsUpdate };
      }
      if (table === 'fit_items') {
        return { upsert: fitItemsUpsert, delete: fitItemsDelete };
      }
      throw new Error(`unexpected table ${table}`);
    });
    (supabase.storage.from as jest.Mock).mockReturnValue({ remove });

    return { fitsUpsert, fitItemsUpsert, fitsUpdate, remove, fitItemsDelete, fitItemsDeleteEq, fitItemsDeleteNot };
  }

  it('upserts the fits row then the fit_items rows', async () => {
    const { fitsUpsert, fitItemsUpsert } = mockSupabase({ fitError: null });

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM]);

    expect(fitsUpsert).toHaveBeenCalledWith(
      {
        id: 'fit-1',
        user_id: 'user-1',
        name: 'My Fit',
        cover_path: COVER_PATH,
        canvas_background_color: null,
        deleted_at: null,
      },
      { onConflict: 'id' },
    );
    expect(fitItemsUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'placement-1',
          fit_id: 'fit-1',
          item_id: 'wardrobe-item-1',
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z_index: 1,
        }),
      ],
      { onConflict: 'id' },
    );
  });

  it("persists the canvas's chosen background color on the fits row", async () => {
    const { fitsUpsert } = mockSupabase({ fitError: null });

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, '#F6DADA', [ITEM]);

    expect(fitsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ canvas_background_color: '#F6DADA' }),
      { onConflict: 'id' },
    );
  });

  it('rolls back the cover upload when the fits row insert fails', async () => {
    const { remove } = mockSupabase({ fitError: new Error('boom') });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledWith([COVER_PATH]);
  });

  it('rolls back the cover upload and soft-deletes the orphaned fits row when fit_items fails', async () => {
    const { remove, fitsUpdate } = mockSupabase({ fitError: null, itemsError: new Error('boom') });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledWith([COVER_PATH]);
    expect(fitsUpdate).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
  });

  it('clears deleted_at on a retry that succeeds after an earlier fit_items failure soft-deleted the row', async () => {
    const fitsUpsert = jest.fn().mockResolvedValue({ error: null });
    const fitItemsUpsert = jest
      .fn()
      .mockResolvedValueOnce({ error: new Error('boom') })
      .mockResolvedValueOnce({ error: null });
    const fitsUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const remove = jest.fn().mockResolvedValue({ error: null });

    const { del: fitItemsDelete } = mockFitItemsDeleteChain();

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'fits') {
        return { upsert: fitsUpsert, update: fitsUpdate };
      }
      if (table === 'fit_items') {
        return { upsert: fitItemsUpsert, delete: fitItemsDelete };
      }
      throw new Error(`unexpected table ${table}`);
    });
    (supabase.storage.from as jest.Mock).mockReturnValue({ remove });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toThrow('boom');
    expect(fitsUpdate).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM]);

    expect(fitsUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ deleted_at: null }), { onConflict: 'id' });
  });

  it('classifies a no-connection failure on the fits upsert', async () => {
    mockSupabase({ fitError: new AuthRetryableFetchError('offline', 0) });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('classifies a no-connection failure on the fit_items upsert', async () => {
    mockSupabase({ fitError: null, itemsError: new AuthRetryableFetchError('offline', 0) });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('persists two distinct rows when the same wardrobe item is placed on canvas twice', async () => {
    const { fitItemsUpsert } = mockSupabase({ fitError: null });
    const secondPlacement: FitItemPlacement = { ...ITEM, id: 'placement-2', x: 0.6, y: 0.6, zIndex: 2 };

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM, secondPlacement]);

    const rows = fitItemsUpsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[0].item_id).toBe('wardrobe-item-1');
    expect(rows[1].item_id).toBe('wardrobe-item-1');
  });

  describe('orphaned fit_items cleanup (Story 3.3 edit re-save)', () => {
    it('deletes fit_items rows for this fitId not present in the new placement set', async () => {
      const { fitItemsDeleteEq, fitItemsDeleteNot } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM]);

      expect(fitItemsDeleteEq).toHaveBeenCalledWith('fit_id', 'fit-1');
      expect(fitItemsDeleteNot).toHaveBeenCalledWith('id', 'in', `(${ITEM.id})`);
    });

    it('deletes every fit_items row for this fitId when the new placement set is empty', async () => {
      const { fitItemsDeleteEq, fitItemsDeleteNot } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, []);

      expect(fitItemsDeleteEq).toHaveBeenCalledWith('fit_id', 'fit-1');
      expect(fitItemsDeleteNot).not.toHaveBeenCalled();
    });

    it('classifies a no-connection failure during cleanup', async () => {
      mockSupabase({ fitError: null, cleanupError: new AuthRetryableFetchError('offline', 0) });

      await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toMatchObject({
        name: 'FitError',
        kind: 'no_connection',
      });
    });

    it('rethrows other cleanup errors', async () => {
      mockSupabase({ fitError: null, cleanupError: new Error('boom') });

      await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, null, [ITEM])).rejects.toThrow('boom');
    });
  });
});
