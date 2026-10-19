jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { fitThumbPath, getFits } from '@/lib/fits/listFits';
import { supabase } from '@/lib/supabase';

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const order = jest.fn().mockResolvedValue(result);
  const is = jest.fn().mockReturnValue({ order });
  const eq = jest.fn().mockReturnValue({ is });
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq, is, order };
}

describe('getFits', () => {
  it('selects is_favorite and cover_thumb_path alongside the existing columns and passes them through', async () => {
    const { select, eq, is, order } = mockSelectChain({
      data: [
        {
          id: 'fit-1',
          name: 'Weekend Look',
          cover_path: 'user-1/fits/fit-1/cover.png',
          cover_thumb_path: null,
          canvas_background_color: null,
          updated_at: '2026-09-18T00:00:00.000Z',
          is_favorite: true,
        },
      ],
      error: null,
    });

    const fits = await getFits('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fits');
    expect(select).toHaveBeenCalledWith(
      'id, name, cover_path, cover_thumb_path, canvas_background_color, updated_at, is_favorite',
    );
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(is).toHaveBeenCalledWith('deleted_at', null);
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(fits).toEqual([expect.objectContaining({ id: 'fit-1', is_favorite: true })]);
  });

  it('rethrows a query error', async () => {
    mockSelectChain({ data: null, error: new Error('boom') });

    await expect(getFits('user-1')).rejects.toThrow('boom');
  });
});

describe('fitThumbPath', () => {
  it("prefers the cover's small WebP thumbnail when the Fit has one", () => {
    expect(
      fitThumbPath({
        cover_path: 'user-1/fits/fit-1/cover-1.png',
        cover_thumb_path: 'user-1/fits/fit-1/cover-1_thumb.webp',
      }),
    ).toBe('user-1/fits/fit-1/cover-1_thumb.webp');
  });

  it('falls back to the full cover for a Fit saved before thumbnails existed', () => {
    expect(fitThumbPath({ cover_path: 'user-1/fits/fit-1/cover.png', cover_thumb_path: null })).toBe(
      'user-1/fits/fit-1/cover.png',
    );
  });

  it('is null when the Fit has neither', () => {
    expect(fitThumbPath({ cover_path: null, cover_thumb_path: null })).toBeNull();
  });
});
