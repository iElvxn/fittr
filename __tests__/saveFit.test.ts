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

import { uploadCover, insertFit, FIT_COVER_THUMB_LONG_EDGE, type FitItemPlacement } from '@/lib/fits/saveFit';
import { supabase } from '@/lib/supabase';

const TS = 1700000000000;
const COVER_PATH = `user-1/fits/fit-1/cover-${TS}.png`;
const THUMB_PATH = `user-1/fits/fit-1/cover-${TS}_thumb.webp`;

const ITEM: FitItemPlacement = {
  id: 'placement-1',
  wardrobeItemId: 'wardrobe-item-1',
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  zIndex: 1,
};

describe('FIT_COVER_THUMB_LONG_EDGE', () => {
  it('is 800px: a height-bound ~259pt grid tile at 3x needs ~780px', () => {
    expect(FIT_COVER_THUMB_LONG_EDGE).toBe(800);
  });
});

describe('uploadCover', () => {
  function mockStorage(upload: jest.Mock) {
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
    return { remove };
  }

  it('uploads the cover PNG and its WebP thumbnail under one shared version stamp, cached for a year', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const { remove } = mockStorage(upload);

    const paths = await uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp');

    expect(supabase.storage.from).toHaveBeenCalledWith('wardrobe');
    expect(upload).toHaveBeenCalledWith(
      COVER_PATH,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/png', upsert: true, cacheControl: '31536000' }),
    );
    expect(upload).toHaveBeenCalledWith(
      THUMB_PATH,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/webp', upsert: true, cacheControl: '31536000' }),
    );
    expect(paths).toEqual({ coverPath: COVER_PATH, thumbPath: THUMB_PATH });
    expect(remove).not.toHaveBeenCalled();
  });

  it('a retry with the same ts lands on the same pair of paths, overwriting its own partial upload', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    mockStorage(upload);

    const first = await uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp');
    const retry = await uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp');

    expect(retry).toEqual(first);
  });

  it('a new save (new ts) gets a different pair, so a re-save is never mistaken for unchanged content', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    mockStorage(upload);

    const first = await uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp');
    const second = await uploadCover('user-1', 'fit-1', TS + 5000, 'file://collage.png', 'file://thumb.webp');

    expect(second.coverPath).not.toBe(first.coverPath);
    expect(second.thumbPath).not.toBe(first.thumbPath);
  });

  it('removes both objects and classifies no-connection when the thumbnail upload fails', async () => {
    const upload = jest.fn().mockImplementation((path: string) =>
      Promise.resolve({ error: path === THUMB_PATH ? new AuthRetryableFetchError('offline', 0) : null }),
    );
    const { remove } = mockStorage(upload);

    await expect(
      uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp'),
    ).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(remove).toHaveBeenCalledWith([COVER_PATH, THUMB_PATH]);
  });

  it('waits for the slower upload to settle before rolling back, so it never lands orphaned', async () => {
    const events: string[] = [];
    let resolveCover: (value: { error: null }) => void = () => {};
    const upload = jest.fn().mockImplementation((path: string) => {
      if (path === THUMB_PATH) {
        events.push('thumb rejected');
        return Promise.resolve({ error: new Error('thumb boom') });
      }
      return new Promise((resolve) => {
        resolveCover = (value) => {
          events.push('cover resolved');
          resolve(value);
        };
      });
    });
    const { remove } = mockStorage(upload);
    remove.mockImplementation(() => {
      events.push('remove');
      return Promise.resolve({ error: null });
    });

    const pending = uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp');
    // Let the thumbnail's rejection propagate while the cover is still in flight.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(remove).not.toHaveBeenCalled();

    resolveCover({ error: null });
    await expect(pending).rejects.toThrow('thumb boom');

    expect(events).toEqual(['thumb rejected', 'cover resolved', 'remove']);
    expect(remove).toHaveBeenCalledWith([COVER_PATH, THUMB_PATH]);
  });

  it('removes both objects and rethrows any other upload error as-is', async () => {
    const upload = jest.fn().mockImplementation((path: string) =>
      Promise.resolve({ error: path === COVER_PATH ? new Error('boom') : null }),
    );
    const { remove } = mockStorage(upload);

    await expect(uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp')).rejects.toThrow(
      'boom',
    );
    expect(remove).toHaveBeenCalledWith([COVER_PATH, THUMB_PATH]);
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

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM]);

    expect(fitsUpsert).toHaveBeenCalledWith(
      {
        id: 'fit-1',
        user_id: 'user-1',
        name: 'My Fit',
        cover_path: COVER_PATH,
        cover_thumb_path: THUMB_PATH,
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

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, '#F6DADA', [ITEM]);

    expect(fitsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ canvas_background_color: '#F6DADA' }),
      { onConflict: 'id' },
    );
  });

  it('rolls back the cover pair when the fits row insert fails', async () => {
    const { remove } = mockSupabase({ fitError: new Error('boom') });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledWith([COVER_PATH, THUMB_PATH]);
  });

  it('rolls back the cover pair and soft-deletes the orphaned fits row when fit_items fails', async () => {
    const { remove, fitsUpdate } = mockSupabase({ fitError: null, itemsError: new Error('boom') });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toThrow('boom');

    expect(remove).toHaveBeenCalledWith([COVER_PATH, THUMB_PATH]);
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

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toThrow('boom');
    expect(fitsUpdate).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM]);

    expect(fitsUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ deleted_at: null }), { onConflict: 'id' });
  });

  it('classifies a no-connection failure on the fits upsert', async () => {
    mockSupabase({ fitError: new AuthRetryableFetchError('offline', 0) });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('classifies a no-connection failure on the fit_items upsert', async () => {
    mockSupabase({ fitError: null, itemsError: new AuthRetryableFetchError('offline', 0) });

    await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('persists two distinct rows when the same wardrobe item is placed on canvas twice', async () => {
    const { fitItemsUpsert } = mockSupabase({ fitError: null });
    const secondPlacement: FitItemPlacement = { ...ITEM, id: 'placement-2', x: 0.6, y: 0.6, zIndex: 2 };

    await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM, secondPlacement]);

    const rows = fitItemsUpsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[0].item_id).toBe('wardrobe-item-1');
    expect(rows[1].item_id).toBe('wardrobe-item-1');
  });

  describe('orphaned fit_items cleanup (Story 3.3 edit re-save)', () => {
    it('deletes fit_items rows for this fitId not present in the new placement set', async () => {
      const { fitItemsDeleteEq, fitItemsDeleteNot } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM]);

      expect(fitItemsDeleteEq).toHaveBeenCalledWith('fit_id', 'fit-1');
      expect(fitItemsDeleteNot).toHaveBeenCalledWith('id', 'in', `(${ITEM.id})`);
    });

    it('deletes every fit_items row for this fitId when the new placement set is empty', async () => {
      const { fitItemsDeleteEq, fitItemsDeleteNot } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, []);

      expect(fitItemsDeleteEq).toHaveBeenCalledWith('fit_id', 'fit-1');
      expect(fitItemsDeleteNot).not.toHaveBeenCalled();
    });

    it('classifies a no-connection failure during cleanup', async () => {
      mockSupabase({ fitError: null, cleanupError: new AuthRetryableFetchError('offline', 0) });

      await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toMatchObject({
        name: 'FitError',
        kind: 'no_connection',
      });
    });

    it('rethrows other cleanup errors', async () => {
      mockSupabase({ fitError: null, cleanupError: new Error('boom') });

      await expect(insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toThrow('boom');
    });
  });

  describe('previous cover cleanup (Story 3.3 edit re-save)', () => {
    const PREVIOUS_COVER_PATH = 'user-1/fits/fit-1/cover-1699999999999.png';
    const PREVIOUS_THUMB_PATH = 'user-1/fits/fit-1/cover-1699999999999_thumb.webp';

    it('deletes the previous cover and its thumbnail in one call once every write has committed', async () => {
      const { remove } = mockSupabase({ fitError: null });

      await insertFit(
        'user-1',
        'fit-1',
        'My Fit',
        COVER_PATH,
        THUMB_PATH,
        PREVIOUS_COVER_PATH,
        PREVIOUS_THUMB_PATH,
        null,
        [ITEM],
      );

      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith([PREVIOUS_COVER_PATH, PREVIOUS_THUMB_PATH]);
    });

    it('deletes only the previous cover for a pre-thumbnail Fit (null previous thumb)', async () => {
      const { remove } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, PREVIOUS_COVER_PATH, null, null, [ITEM]);

      expect(remove).toHaveBeenCalledWith([PREVIOUS_COVER_PATH]);
    });

    it('does nothing for a brand-new Fit with no previous cover', async () => {
      const { remove } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM]);

      expect(remove).not.toHaveBeenCalled();
    });

    it('never deletes the pair it just wrote, even if somehow passed as its own "previous" values', async () => {
      const { remove } = mockSupabase({ fitError: null });

      await insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, COVER_PATH, THUMB_PATH, null, [ITEM]);

      expect(remove).not.toHaveBeenCalled();
    });

    it('never fails the save when the cleanup delete itself fails', async () => {
      const { fitsUpsert } = mockSupabase({ fitError: null });
      (supabase.storage.from as jest.Mock).mockReturnValue({ remove: jest.fn().mockRejectedValue(new Error('boom')) });

      await expect(
        insertFit('user-1', 'fit-1', 'My Fit', COVER_PATH, THUMB_PATH, PREVIOUS_COVER_PATH, null, null, [ITEM]),
      ).resolves.toBeUndefined();
      expect(fitsUpsert).toHaveBeenCalled();
    });
  });
});
