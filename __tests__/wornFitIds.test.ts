jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { getFitWearCounts, getTodayWornFitIds, useFitWearCounts } from '@/lib/fits/wornFitIds';
import { supabase } from '@/lib/supabase';

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq };
}

function mockTwoEqSelectChain(result: { data: unknown; error: unknown }) {
  const eq2 = jest.fn().mockResolvedValue(result);
  const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
  const select = jest.fn().mockReturnValue({ eq: eq1 });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq1, eq2 };
}

describe('getFitWearCounts', () => {
  it('counts wear rows per Fit', async () => {
    const { select, eq } = mockSelectChain({
      data: [{ fit_id: 'fit-1' }, { fit_id: 'fit-2' }, { fit_id: 'fit-1' }, { fit_id: 'fit-1' }],
      error: null,
    });

    const counts = await getFitWearCounts('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('fit_id');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(counts).toEqual(
      new Map([
        ['fit-1', 3],
        ['fit-2', 1],
      ]),
    );
  });

  it('returns an empty map when nothing has been marked worn yet', async () => {
    mockSelectChain({ data: [], error: null });

    await expect(getFitWearCounts('user-1')).resolves.toEqual(new Map());
  });

  it('treats a null data payload as no wears', async () => {
    mockSelectChain({ data: null, error: null });

    await expect(getFitWearCounts('user-1')).resolves.toEqual(new Map());
  });

  it('classifies a no-connection failure', async () => {
    mockSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getFitWearCounts('user-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockSelectChain({ data: null, error: new Error('boom') });

    await expect(getFitWearCounts('user-1')).rejects.toThrow('boom');
  });
});

describe('useFitWearCounts', () => {
  it("caches under ['wornFitIds', userId], the key Fit detail's Wear today invalidates", async () => {
    mockSelectChain({ data: [{ fit_id: 'fit-1' }], error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = await renderHook(() => useFitWearCounts('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryCache().find({ queryKey: ['wornFitIds', 'user-1'] })).toBeTruthy();
  });
});

describe('getTodayWornFitIds', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21, 23, 30, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the set of fit ids with a wear row dated today (local)", async () => {
    const { select, eq1, eq2 } = mockTwoEqSelectChain({
      data: [{ fit_id: 'fit-1' }, { fit_id: 'fit-2' }],
      error: null,
    });

    const ids = await getTodayWornFitIds('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('fit_id');
    expect(eq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eq2).toHaveBeenCalledWith('worn_on', '2026-09-21');
    expect(ids).toEqual(new Set(['fit-1', 'fit-2']));
  });

  it('returns an empty set when nothing was worn today', async () => {
    mockTwoEqSelectChain({ data: [], error: null });

    await expect(getTodayWornFitIds('user-1')).resolves.toEqual(new Set());
  });

  it('classifies a no-connection failure', async () => {
    mockTwoEqSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getTodayWornFitIds('user-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockTwoEqSelectChain({ data: null, error: new Error('boom') });

    await expect(getTodayWornFitIds('user-1')).rejects.toThrow('boom');
  });
});
