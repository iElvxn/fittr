import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  })),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: jest.fn() },
    rpc: jest.fn(),
  },
}));

import { uploadCover, insertFit, FIT_COVER_THUMB_LONG_EDGE, type FitItemPlacement } from '@/lib/fits/saveFit';
import { supabase } from '@/lib/supabase';

const TS = 1700000000000;
const COVER_PATH = `user-1/fits/fit-1/cover-${TS}.png`;
const THUMB_PATH = `user-1/fits/fit-1/cover-${TS}_thumb.webp`;
const PREVIOUS_COVER_PATH = 'user-1/fits/fit-1/cover-1699999999999.png';
const PREVIOUS_THUMB_PATH = 'user-1/fits/fit-1/cover-1699999999999_thumb.webp';

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

  // A retry reuses these paths, and an earlier attempt may have committed them.
  it('keeps both objects and classifies no-connection when the thumbnail upload fails', async () => {
    const upload = jest.fn().mockImplementation((path: string) =>
      Promise.resolve({ error: path === THUMB_PATH ? new AuthRetryableFetchError('offline', 0) : null }),
    );
    const { remove } = mockStorage(upload);

    await expect(
      uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp'),
    ).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('waits for the slower upload to settle before failing, so a retry never races it', async () => {
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

    const pending = uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp').catch((error) => {
      events.push('failed');
      throw error;
    });
    // Let the thumbnail's rejection propagate while the cover is still in flight.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['thumb rejected']);

    resolveCover({ error: null });
    await expect(pending).rejects.toThrow('thumb boom');

    expect(events).toEqual(['thumb rejected', 'cover resolved', 'failed']);
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps both objects and rethrows any other upload error as-is', async () => {
    const upload = jest.fn().mockImplementation((path: string) =>
      Promise.resolve({ error: path === COVER_PATH ? new Error('boom') : null }),
    );
    const { remove } = mockStorage(upload);

    await expect(uploadCover('user-1', 'fit-1', TS, 'file://collage.png', 'file://thumb.webp')).rejects.toThrow(
      'boom',
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('insertFit', () => {
  function mockSave(error: unknown = null) {
    const remove = jest.fn().mockResolvedValue({ error: null });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error });
    (supabase.storage.from as jest.Mock).mockReturnValue({ remove });
    return { remove };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves the Fit and its placements in one call', async () => {
    mockSave();

    await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM]);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('save_fit', {
      p_fit_id: 'fit-1',
      p_name: 'My Fit',
      p_cover_path: COVER_PATH,
      p_cover_thumb_path: THUMB_PATH,
      p_canvas_background_color: null,
      p_items: [
        {
          id: 'placement-1',
          item_id: 'wardrobe-item-1',
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z_index: 1,
        },
      ],
    });
  });

  it("persists the canvas's chosen background color", async () => {
    mockSave();

    await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, '#F6DADA', [ITEM]);

    expect(supabase.rpc).toHaveBeenCalledWith(
      'save_fit',
      expect.objectContaining({ p_canvas_background_color: '#F6DADA' }),
    );
  });

  it('sends two distinct rows when the same wardrobe item is placed on canvas twice', async () => {
    mockSave();
    const secondPlacement: FitItemPlacement = { ...ITEM, id: 'placement-2', x: 0.2, zIndex: 2 };

    await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM, secondPlacement]);

    const { p_items: items } = (supabase.rpc as jest.Mock).mock.calls[0][1];
    expect(items.map((item: { id: string }) => item.id)).toEqual(['placement-1', 'placement-2']);
    expect(items.map((item: { item_id: string }) => item.item_id)).toEqual(['wardrobe-item-1', 'wardrobe-item-1']);
  });

  it('classifies a no-connection failure', async () => {
    mockSave({ message: 'TypeError: Network request failed', code: '' });

    await expect(insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('rethrows a server rejection as-is', async () => {
    const rejection = { message: 'fit not saved', code: 'P0002' };
    mockSave(rejection);

    await expect(insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toBe(rejection);
  });

  it('rethrows a code-less gateway error as-is, not as no connection', async () => {
    const gateway = { message: '<html>504 Gateway Time-out</html>' };
    mockSave(gateway);

    await expect(insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM])).rejects.toBe(gateway);
  });

  // None of these prove the row wasn't saved: an earlier attempt may have
  // committed these same paths, and a gateway error hides the outcome.
  it.each([
    ['a lost connection', { message: 'TypeError: Network request failed', code: '' }],
    ['a server rejection', { message: 'fit not saved', code: 'P0002' }],
    ['a gateway error', { message: '<html>504 Gateway Time-out</html>' }],
  ])('keeps every cover file after %s', async (_name, error) => {
    const { remove } = mockSave(error);

    await expect(
      insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, PREVIOUS_COVER_PATH, PREVIOUS_THUMB_PATH, null, [ITEM]),
    ).rejects.toBeDefined();

    expect(remove).not.toHaveBeenCalled();
  });

  describe('previous cover cleanup (Story 3.3 edit re-save)', () => {
    it('deletes the previous cover and its thumbnail in one call once the save has committed', async () => {
      const { remove } = mockSave();

      await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, PREVIOUS_COVER_PATH, PREVIOUS_THUMB_PATH, null, [ITEM]);

      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith([PREVIOUS_COVER_PATH, PREVIOUS_THUMB_PATH]);
    });

    it('deletes only the previous cover for a pre-thumbnail Fit (null previous thumb)', async () => {
      const { remove } = mockSave();

      await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, PREVIOUS_COVER_PATH, null, null, [ITEM]);

      expect(remove).toHaveBeenCalledWith([PREVIOUS_COVER_PATH]);
    });

    it('does nothing for a brand-new Fit with no previous cover', async () => {
      const { remove } = mockSave();

      await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, null, null, null, [ITEM]);

      expect(remove).not.toHaveBeenCalled();
    });

    it('never deletes the pair it just wrote, even if somehow passed as its own "previous" values', async () => {
      const { remove } = mockSave();

      await insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, COVER_PATH, THUMB_PATH, null, [ITEM]);

      expect(remove).not.toHaveBeenCalled();
    });

    it('never fails the save when the cleanup delete itself fails', async () => {
      mockSave();
      (supabase.storage.from as jest.Mock).mockReturnValue({ remove: jest.fn().mockRejectedValue(new Error('boom')) });

      await expect(
        insertFit('fit-1', 'My Fit', COVER_PATH, THUMB_PATH, PREVIOUS_COVER_PATH, null, null, [ITEM]),
      ).resolves.toBeUndefined();
    });
  });
});
