import { AuthRetryableFetchError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { deleteFit } from '@/lib/fits/deleteFit';
import { supabase } from '@/lib/supabase';

function mockUpdateChain(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ update });
  return { update, eq };
}

describe('deleteFit', () => {
  it('soft-deletes by writing a deleted_at timestamp', async () => {
    const { update, eq } = mockUpdateChain({ error: null });

    await deleteFit('fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fits');
    expect(update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    const [{ deleted_at: deletedAt }] = update.mock.calls[0];
    expect(Number.isNaN(new Date(deletedAt).getTime())).toBe(false);
    expect(eq).toHaveBeenCalledWith('id', 'fit-1');
  });

  it('classifies a no-connection failure', async () => {
    mockUpdateChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(deleteFit('fit-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockUpdateChain({ error: new Error('boom') });

    await expect(deleteFit('fit-1')).rejects.toThrow('boom');
  });
});
