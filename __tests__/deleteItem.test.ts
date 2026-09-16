import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { deleteWardrobeItem } from '@/lib/wardrobe/deleteItem';
import { supabase } from '@/lib/supabase';

function mockUpdateChain(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq };
}

describe('deleteWardrobeItem', () => {
  it('soft-deletes by writing a deleted_at timestamp', async () => {
    const { update, eq } = mockUpdateChain({ error: null });

    await deleteWardrobeItem('item-1');

    expect(supabase.from).toHaveBeenCalledWith('wardrobe_items');
    expect(update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    const [{ deleted_at: deletedAt }] = update.mock.calls[0];
    expect(Number.isNaN(new Date(deletedAt).getTime())).toBe(false);
    expect(eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('classifies a no-connection failure', async () => {
    mockUpdateChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(deleteWardrobeItem('item-1')).rejects.toMatchObject({ kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockUpdateChain({ error: new Error('boom') });

    await expect(deleteWardrobeItem('item-1')).rejects.toThrow('boom');
  });
});
