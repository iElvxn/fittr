jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { getWearDates, useWearDates, wearStreak } from '@/lib/fits/wearStreak';
import { supabase } from '@/lib/supabase';

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const order = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq, order };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('wearStreak', () => {
  it('counts back from today when today was worn', () => {
    expect(wearStreak(new Set(['2025-09-22', '2025-09-23', '2025-09-24']), '2025-09-24')).toBe(3);
  });

  it('counts back from yesterday when today has no wear yet', () => {
    expect(wearStreak(new Set(['2025-09-22', '2025-09-23']), '2025-09-24')).toBe(2);
  });

  it('is 1 for a wear today alone', () => {
    expect(wearStreak(new Set(['2025-09-24']), '2025-09-24')).toBe(1);
  });

  it('is 0 when the last wear was before yesterday', () => {
    expect(wearStreak(new Set(['2025-09-22']), '2025-09-24')).toBe(0);
  });

  it('is 0 with no wears at all', () => {
    expect(wearStreak(new Set(), '2025-09-24')).toBe(0);
  });

  it('stops at the first gap', () => {
    expect(wearStreak(new Set(['2025-09-20', '2025-09-22', '2025-09-23', '2025-09-24']), '2025-09-24')).toBe(3);
  });

  it('ignores wears dated after today', () => {
    expect(wearStreak(new Set(['2025-09-24', '2025-09-25']), '2025-09-24')).toBe(1);
  });

  it('runs across a month end', () => {
    expect(wearStreak(new Set(['2025-09-29', '2025-09-30', '2025-10-01']), '2025-10-01')).toBe(3);
  });

  it('runs across a year end', () => {
    expect(wearStreak(new Set(['2025-12-31', '2026-01-01']), '2026-01-02')).toBe(2);
  });

  it('runs across the spring daylight-saving change', () => {
    // US clocks spring forward on Mar 8 2026.
    expect(wearStreak(new Set(['2026-03-07', '2026-03-08', '2026-03-09']), '2026-03-09')).toBe(3);
  });

  it('runs across the autumn daylight-saving change', () => {
    // US clocks fall back on Nov 1 2026.
    expect(wearStreak(new Set(['2026-10-31', '2026-11-01', '2026-11-02']), '2026-11-02')).toBe(3);
  });
});

describe('getWearDates', () => {
  it("returns the user's distinct wear dates", async () => {
    const { select, eq, order } = mockSelectChain({
      data: [{ worn_on: '2025-09-23' }, { worn_on: '2025-09-24' }, { worn_on: '2025-09-23' }],
      error: null,
    });

    const dates = await getWearDates('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('worn_on');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    // Newest first, so a capped response drops old history rather than the streak's days.
    expect(order).toHaveBeenCalledWith('worn_on', { ascending: false });
    expect(dates).toEqual(new Set(['2025-09-23', '2025-09-24']));
  });

  it('treats a null data payload as no wears', async () => {
    mockSelectChain({ data: null, error: null });

    await expect(getWearDates('user-1')).resolves.toEqual(new Set());
  });

  it('classifies a no-connection failure', async () => {
    mockSelectChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getWearDates('user-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockSelectChain({ data: null, error: new Error('boom') });

    await expect(getWearDates('user-1')).rejects.toThrow('boom');
  });
});

describe('useWearDates', () => {
  it("caches under ['wearDates', userId], the key every wear write invalidates", async () => {
    mockSelectChain({ data: [{ worn_on: '2025-09-24' }], error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = await renderHook(() => useWearDates('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['wearDates', 'user-1'])).toEqual(new Set(['2025-09-24']));
  });

  it('does not run without a user', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = await renderHook(() => useWearDates(undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
