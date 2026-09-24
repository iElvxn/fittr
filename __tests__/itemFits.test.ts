jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { createElement, type ReactNode } from 'react';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { getItemFitIds, useItemFitIds } from '@/lib/wardrobe/itemFits';
import { supabase } from '@/lib/supabase';

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq };
}

describe('getItemFitIds', () => {
  it('reads fit_ids for the piece and returns each Fit once, in first-seen order', async () => {
    const { select, eq } = mockSelectChain({
      data: [{ fit_id: 'fit-a' }, { fit_id: 'fit-b' }, { fit_id: 'fit-a' }],
      error: null,
    });

    const ids = await getItemFitIds('item-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_items');
    expect(select).toHaveBeenCalledWith('fit_id');
    expect(eq).toHaveBeenCalledWith('item_id', 'item-1');
    // No user_id filter -- fit_items RLS scopes through fits.user_id.
    expect(eq).toHaveBeenCalledTimes(1);
    expect(ids).toEqual(['fit-a', 'fit-b']);
  });

  it('returns an empty array for a piece in no Fit', async () => {
    mockSelectChain({ data: [], error: null });

    await expect(getItemFitIds('item-1')).resolves.toEqual([]);
  });

  it('classifies a no-connection failure', async () => {
    mockSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getItemFitIds('item-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors unclassified', async () => {
    const boom = new Error('boom');
    mockSelectChain({ data: null, error: boom });

    await expect(getItemFitIds('item-1')).rejects.toBe(boom);
  });
});

describe('useItemFitIds', () => {
  function makeWrapper() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return { queryClient, wrapper };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves to the distinct ids under ['itemFits', itemId]", async () => {
    mockSelectChain({ data: [{ fit_id: 'fit-a' }, { fit_id: 'fit-a' }, { fit_id: 'fit-b' }], error: null });
    const { queryClient, wrapper } = makeWrapper();

    const { result } = await renderHook(() => useItemFitIds('item-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['fit-a', 'fit-b']);
    expect(queryClient.getQueryCache().find({ queryKey: ['itemFits', 'item-1'] })).toBeTruthy();
  });

  it('does not query when the item id is undefined', async () => {
    const { wrapper } = makeWrapper();

    const { result } = await renderHook(() => useItemFitIds(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
