import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { toggleFitFavorite } from '@/lib/fits/toggleFavorite';
import { supabase } from '@/lib/supabase';

function mockUpdateChain(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq };
}

describe('toggleFitFavorite', () => {
  it('sets is_favorite to true', async () => {
    const { update, eq } = mockUpdateChain({ error: null });

    await toggleFitFavorite('fit-1', true);

    expect(supabase.from).toHaveBeenCalledWith('fits');
    expect(update).toHaveBeenCalledWith({ is_favorite: true });
    expect(eq).toHaveBeenCalledWith('id', 'fit-1');
  });

  it('sets is_favorite to false', async () => {
    const { update } = mockUpdateChain({ error: null });

    await toggleFitFavorite('fit-1', false);

    expect(update).toHaveBeenCalledWith({ is_favorite: false });
  });

  it('classifies a no-connection failure', async () => {
    mockUpdateChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(toggleFitFavorite('fit-1', true)).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockUpdateChain({ error: new Error('boom') });

    await expect(toggleFitFavorite('fit-1', true)).rejects.toThrow('boom');
  });
});
