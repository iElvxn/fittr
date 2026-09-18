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
  it('maps fit_items rows into FitItemPlacement shape', async () => {
    const { select, eq } = mockSelectChain({
      data: [
        { id: 'placement-1', item_id: 'wardrobe-item-1', x: 0.5, y: 0.5, scale: 1, rotation: 0, z_index: 1 },
        { id: 'placement-2', item_id: 'wardrobe-item-2', x: 0.6, y: 0.6, scale: 1.2, rotation: 15, z_index: 2 },
      ],
      error: null,
    });

    const items = await getFitItems('fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_items');
    expect(select).toHaveBeenCalledWith('id, item_id, x, y, scale, rotation, z_index');
    expect(eq).toHaveBeenCalledWith('fit_id', 'fit-1');
    expect(items).toEqual([
      { id: 'placement-1', wardrobeItemId: 'wardrobe-item-1', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 1 },
      { id: 'placement-2', wardrobeItemId: 'wardrobe-item-2', x: 0.6, y: 0.6, scale: 1.2, rotation: 15, zIndex: 2 },
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
