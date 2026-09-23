jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { AuthRetryableFetchError } from '@supabase/supabase-js';

import { getWornFitIds } from '@/lib/fits/wornFitIds';
import { supabase } from '@/lib/supabase';

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq };
}

describe('getWornFitIds', () => {
  it('returns the distinct set of fit ids with at least one wear row', async () => {
    const { select, eq } = mockSelectChain({
      data: [{ fit_id: 'fit-1' }, { fit_id: 'fit-2' }, { fit_id: 'fit-1' }],
      error: null,
    });

    const ids = await getWornFitIds('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('fit_id');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(ids).toEqual(new Set(['fit-1', 'fit-2']));
  });

  it('returns an empty set when nothing has been marked worn yet', async () => {
    mockSelectChain({ data: [], error: null });

    await expect(getWornFitIds('user-1')).resolves.toEqual(new Set());
  });

  it('classifies a no-connection failure', async () => {
    mockSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getWornFitIds('user-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockSelectChain({ data: null, error: new Error('boom') });

    await expect(getWornFitIds('user-1')).rejects.toThrow('boom');
  });
});
