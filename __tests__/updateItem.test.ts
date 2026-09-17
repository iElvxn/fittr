import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { updateWardrobeItem } from '@/lib/wardrobe/updateItem';
import { supabase } from '@/lib/supabase';

function mockUpdateChain(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq };
}

describe('updateWardrobeItem', () => {
  it('writes category, color, and trimmed optional fields', async () => {
    const { update, eq } = mockUpdateChain({ error: null });

    await updateWardrobeItem('item-1', {
      category: 'top',
      colorHex: '#0C0A09',
      name: '  Silk shirt  ',
      brand: '  Everlane  ',
      notes: '  Dry clean only  ',
    });

    expect(supabase.from).toHaveBeenCalledWith('wardrobe_items');
    expect(update).toHaveBeenCalledWith({
      category: 'top',
      color_hex: '#0C0A09',
      name: 'Silk shirt',
      brand: 'Everlane',
      notes: 'Dry clean only',
    });
    expect(eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('normalizes empty optional fields and a null color to null', async () => {
    const { update } = mockUpdateChain({ error: null });

    await updateWardrobeItem('item-1', {
      category: 'shoes',
      colorHex: null,
      name: '',
      brand: '   ',
      notes: undefined,
    });

    expect(update).toHaveBeenCalledWith({
      category: 'shoes',
      color_hex: null,
      name: null,
      brand: null,
      notes: null,
    });
  });

  it('classifies a no-connection failure', async () => {
    mockUpdateChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(
      updateWardrobeItem('item-1', { category: 'top', colorHex: null }),
    ).rejects.toMatchObject({ kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockUpdateChain({ error: new Error('boom') });

    await expect(updateWardrobeItem('item-1', { category: 'top', colorHex: null })).rejects.toThrow(
      'boom',
    );
  });
});
