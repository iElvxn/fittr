jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { AuthRetryableFetchError } from '@supabase/supabase-js';

import { getFitItems } from '@/lib/fits/getFitItems';
import { supabase } from '@/lib/supabase';

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq };
}

describe('getFitItems', () => {
  it('maps fit_items rows into FitItemPlacement shape, with the joined category and a live source item', async () => {
    const { select, eq } = mockSelectChain({
      data: [
        {
          id: 'placement-1',
          item_id: 'wardrobe-item-1',
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z_index: 1,
          wardrobe_items: { category: 'top', deleted_at: null, name: 'White Tee', thumb_path: 'user-1/items/a/thumb.webp' },
        },
        {
          id: 'placement-2',
          item_id: 'wardrobe-item-2',
          x: 0.6,
          y: 0.6,
          scale: 1.2,
          rotation: 15,
          z_index: 2,
          wardrobe_items: { category: 'shoes', deleted_at: null, name: null, thumb_path: 'user-1/items/b/thumb.webp' },
        },
      ],
      error: null,
    });

    const items = await getFitItems('fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_items');
    expect(select).toHaveBeenCalledWith(
      'id, item_id, x, y, scale, rotation, z_index, wardrobe_items(category, deleted_at, name, thumb_path)',
    );
    expect(eq).toHaveBeenCalledWith('fit_id', 'fit-1');
    expect(items).toEqual([
      {
        id: 'placement-1',
        wardrobeItemId: 'wardrobe-item-1',
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        zIndex: 1,
        category: 'top',
        wardrobeItemDeleted: false,
        name: 'White Tee',
        thumbPath: 'user-1/items/a/thumb.webp',
      },
      {
        id: 'placement-2',
        wardrobeItemId: 'wardrobe-item-2',
        x: 0.6,
        y: 0.6,
        scale: 1.2,
        rotation: 15,
        zIndex: 2,
        category: 'shoes',
        wardrobeItemDeleted: false,
        name: null,
        thumbPath: 'user-1/items/b/thumb.webp',
      },
    ]);
  });

  it('flags a placement whose source wardrobe item has been soft-deleted', async () => {
    mockSelectChain({
      data: [
        {
          id: 'placement-1',
          item_id: 'wardrobe-item-1',
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z_index: 1,
          wardrobe_items: {
            category: 'top',
            deleted_at: '2026-09-19T00:00:00.000Z',
            name: 'White Tee',
            thumb_path: 'user-1/items/a/thumb.webp',
          },
        },
      ],
      error: null,
    });

    const items = await getFitItems('fit-1');

    // A deleted item's last-known name/thumbnail still comes through -- the
    // item list (Story 4.1) needs them to render a muted "Removed" row
    // rather than a blank one, same recovered-not-guessed category as the
    // canvas gap (Story 3.4).
    expect(items).toEqual([
      expect.objectContaining({
        id: 'placement-1',
        category: 'top',
        wardrobeItemDeleted: true,
        name: 'White Tee',
        thumbPath: 'user-1/items/a/thumb.webp',
      }),
    ]);
  });

  it('treats a placement whose wardrobe_items join comes back null as a gap, not a live item with a bogus category', async () => {
    // The FK guarantees a row exists and RLS never filters a soft-deleted
    // one out (see the type's own doc comment), so this is a defensive path
    // rather than an expected one -- but the join *type* admits `null`, so
    // this must never silently read as "not deleted".
    mockSelectChain({
      data: [
        {
          id: 'placement-1',
          item_id: 'wardrobe-item-1',
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          z_index: 1,
          wardrobe_items: null,
        },
      ],
      error: null,
    });

    const items = await getFitItems('fit-1');

    expect(items).toEqual([
      expect.objectContaining({ id: 'placement-1', wardrobeItemDeleted: true, category: 'top', name: null, thumbPath: '' }),
    ]);
  });

  it('returns an empty array for a Fit with no placements', async () => {
    mockSelectChain({ data: [], error: null });

    await expect(getFitItems('fit-1')).resolves.toEqual([]);
  });

  it('classifies a no-connection failure', async () => {
    mockSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getFitItems('fit-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockSelectChain({ data: null, error: new Error('boom') });

    await expect(getFitItems('fit-1')).rejects.toThrow('boom');
  });
});
