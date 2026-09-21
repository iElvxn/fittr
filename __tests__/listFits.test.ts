jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { getFits } from '@/lib/fits/listFits';
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
  it('selects is_favorite alongside the existing columns and passes it through', async () => {
    const { select, eq, is, order } = mockSelectChain({
      data: [
        {
          id: 'fit-1',
          name: 'Weekend Look',
          cover_path: 'user-1/fits/fit-1/cover.png',
          canvas_background_color: null,
          updated_at: '2026-09-18T00:00:00.000Z',
          is_favorite: true,
        },
      ],
      error: null,
    });

    const fits = await getFits('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fits');
    expect(select).toHaveBeenCalledWith('id, name, cover_path, canvas_background_color, updated_at, is_favorite');
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
