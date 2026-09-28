jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));
// `markFitWorn` (for its shared invalidation) imports the photo module, whose native image modules can't load here.
jest.mock('@/lib/fits/wearPhoto', () => ({ deleteWearPhotoFiles: jest.fn() }));

import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { getFitWearCounts, getTodayWornFitIds, useFitWearCounts, useTodayWornFitIds } from '@/lib/fits/wornFitIds';
import { invalidateWearQueries } from '@/lib/fits/markFitWorn';
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

beforeEach(() => {
  jest.clearAllMocks();
});

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
  it("maps each fit id worn on the given day to its wear and photo", async () => {
    const { select, eq1, eq2 } = mockTwoEqSelectChain({
      data: [
        { id: 'wear-1', fit_id: 'fit-1', photo_path: null, photo_thumb_path: null, photo_thumbhash: null },
        {
          id: 'wear-2',
          fit_id: 'fit-2',
          photo_path: 'user-1/wear-2/p.webp',
          photo_thumb_path: 'user-1/wear-2/p_thumb.webp',
          photo_thumbhash: 'hash',
        },
      ],
      error: null,
    });

    const wears = await getTodayWornFitIds('user-1', '2026-09-21');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('id, fit_id, photo_path, photo_thumb_path, photo_thumbhash');
    expect(eq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eq2).toHaveBeenCalledWith('worn_on', '2026-09-21');
    expect(wears).toEqual(
      new Map([
        ['fit-1', { id: 'wear-1', photo: null }],
        [
          'fit-2',
          { id: 'wear-2', photo: { path: 'user-1/wear-2/p.webp', thumbPath: 'user-1/wear-2/p_thumb.webp', thumbhash: 'hash' } },
        ],
      ]),
    );
    // Still answers "was this Fit worn today?" by id.
    expect(wears.has('fit-1')).toBe(true);
  });

  it("queries the date it's given, not the clock's", async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 22, 9, 0, 0));
    try {
      const { eq2 } = mockTwoEqSelectChain({ data: [], error: null });

      await getTodayWornFitIds('user-1', '2026-09-21');

      expect(eq2).toHaveBeenCalledWith('worn_on', '2026-09-21');
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns an empty map when nothing was worn today', async () => {
    mockTwoEqSelectChain({ data: [], error: null });

    await expect(getTodayWornFitIds('user-1', '2026-09-21')).resolves.toEqual(new Map());
  });

  it('classifies a no-connection failure', async () => {
    mockTwoEqSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getTodayWornFitIds('user-1', '2026-09-21')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockTwoEqSelectChain({ data: null, error: new Error('boom') });

    await expect(getTodayWornFitIds('user-1', '2026-09-21')).rejects.toThrow('boom');
  });
});

describe('useTodayWornFitIds', () => {
  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return { queryClient, wrapper };
  }

  it("caches under ['todayWornFitIds', userId, today]", async () => {
    mockTwoEqSelectChain({ data: [{ id: 'wear-1', fit_id: 'fit-1', photo_path: null }], error: null });
    const { queryClient, wrapper } = setup();

    const { result } = await renderHook(() => useTodayWornFitIds('user-1', '2026-09-26'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['todayWornFitIds', 'user-1', '2026-09-26'])).toEqual(
      new Map([['fit-1', { id: 'wear-1', photo: null }]]),
    );
  });

  it("reads a new day under its own key, never serving the day before's wears", async () => {
    const { eq2 } = mockTwoEqSelectChain({ data: [{ id: 'wear-1', fit_id: 'fit-1', photo_path: null }], error: null });
    const { wrapper } = setup();
    const { result, rerender } = await renderHook(({ today }: { today: string }) => useTodayWornFitIds('user-1', today), {
      wrapper,
      initialProps: { today: '2026-09-26' },
    });
    await waitFor(() => expect(result.current.data?.has('fit-1')).toBe(true));

    let resolveNextDay: (value: { data: unknown; error: unknown }) => void = () => {};
    eq2.mockReturnValue(new Promise((resolve) => (resolveNextDay = resolve)));
    await rerender({ today: '2026-09-27' });

    // Still loading the new day: nothing from yesterday stands in for it.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(eq2).toHaveBeenLastCalledWith('worn_on', '2026-09-27');

    await act(async () => resolveNextDay({ data: [], error: null }));
    await waitFor(() => expect(result.current.data).toEqual(new Map()));
  });

  it('reads nothing again when the day stays the same', async () => {
    mockTwoEqSelectChain({ data: [], error: null });
    const { wrapper } = setup();
    const { result, rerender } = await renderHook(({ today }: { today: string }) => useTodayWornFitIds('user-1', today), {
      wrapper,
      initialProps: { today: '2026-09-26' },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await rerender({ today: '2026-09-26' });

    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("is refetched by every wear write's ['todayWornFitIds', userId] invalidation", async () => {
    mockTwoEqSelectChain({ data: [], error: null });
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useTodayWornFitIds('user-1', '2026-09-26'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => invalidateWearQueries(queryClient, 'user-1'));

    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});
