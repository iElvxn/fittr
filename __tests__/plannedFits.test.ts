jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import {
  getPlannedFits,
  getWearsBetween,
  planFit,
  unplanDay,
  useMonthWears,
  usePlannedFits,
  usePlannedMonth,
  useWeekWears,
} from '@/lib/planner/plannedFits';
import { supabase } from '@/lib/supabase';

function mockRangeChain(result: { data: unknown; error: unknown }) {
  const lte = jest.fn().mockResolvedValue(result);
  const gte = jest.fn().mockReturnValue({ lte });
  const select = jest.fn().mockReturnValue({ gte });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, gte, lte };
}

function mockUpsert(result: { error: unknown }) {
  const upsert = jest.fn().mockResolvedValue(result);
  (supabase.from as jest.Mock).mockReturnValue({ upsert });
  return { upsert };
}

function mockDelete(result: { error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const del = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ delete: del });
  return { del, eq };
}

const offline = () => new AuthRetryableFetchError('offline', 0);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPlannedFits', () => {
  it('reads the plans between two dates, inclusive', async () => {
    const { select, gte, lte } = mockRangeChain({
      data: [{ planned_on: '2025-09-25', fit_id: 'fit-1' }],
      error: null,
    });

    const plans = await getPlannedFits('2025-09-22', '2025-09-28');

    expect(supabase.from).toHaveBeenCalledWith('planned_fits');
    expect(select).toHaveBeenCalledWith('planned_on, fit_id');
    expect(gte).toHaveBeenCalledWith('planned_on', '2025-09-22');
    expect(lte).toHaveBeenCalledWith('planned_on', '2025-09-28');
    expect(plans).toEqual([{ planned_on: '2025-09-25', fit_id: 'fit-1' }]);
  });

  it('treats a null payload as no plans', async () => {
    mockRangeChain({ data: null, error: null });

    await expect(getPlannedFits('2025-09-22', '2025-09-28')).resolves.toEqual([]);
  });

  it('classifies a no-connection failure', async () => {
    mockRangeChain({ data: null, error: offline() });

    await expect(getPlannedFits('2025-09-22', '2025-09-28')).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('rethrows other errors', async () => {
    mockRangeChain({ data: null, error: new Error('boom') });

    await expect(getPlannedFits('2025-09-22', '2025-09-28')).rejects.toThrow('boom');
  });
});

describe('planFit', () => {
  it('upserts one row per user and day, leaving the id to the server', async () => {
    const { upsert } = mockUpsert({ error: null });

    await planFit('user-1', '2025-09-25', 'fit-2');

    expect(supabase.from).toHaveBeenCalledWith('planned_fits');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', planned_on: '2025-09-25', fit_id: 'fit-2' },
      { onConflict: 'user_id,planned_on' },
    );
  });

  it('classifies a no-connection failure', async () => {
    mockUpsert({ error: offline() });

    await expect(planFit('user-1', '2025-09-25', 'fit-2')).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('rethrows other errors', async () => {
    mockUpsert({ error: new Error('boom') });

    await expect(planFit('user-1', '2025-09-25', 'fit-2')).rejects.toThrow('boom');
  });
});

describe('unplanDay', () => {
  it("hard-deletes that day's row", async () => {
    const { del, eq } = mockDelete({ error: null });

    await unplanDay('2025-09-25');

    expect(supabase.from).toHaveBeenCalledWith('planned_fits');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('planned_on', '2025-09-25');
  });

  it('classifies a no-connection failure', async () => {
    mockDelete({ error: offline() });

    await expect(unplanDay('2025-09-25')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockDelete({ error: new Error('boom') });

    await expect(unplanDay('2025-09-25')).rejects.toThrow('boom');
  });
});

describe('getWearsBetween', () => {
  it('returns a fit|date key for every wear in the range', async () => {
    const { select, gte, lte } = mockRangeChain({
      data: [
        { fit_id: 'fit-1', worn_on: '2025-09-22' },
        { fit_id: 'fit-4', worn_on: '2025-09-23' },
      ],
      error: null,
    });

    const wears = await getWearsBetween('2025-09-22', '2025-09-28');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('fit_id, worn_on');
    expect(gte).toHaveBeenCalledWith('worn_on', '2025-09-22');
    expect(lte).toHaveBeenCalledWith('worn_on', '2025-09-28');
    expect(wears).toEqual(new Set(['fit-1|2025-09-22', 'fit-4|2025-09-23']));
  });

  it('treats a null payload as no wears', async () => {
    mockRangeChain({ data: null, error: null });

    await expect(getWearsBetween('2025-09-22', '2025-09-28')).resolves.toEqual(new Set());
  });

  it('classifies a no-connection failure', async () => {
    mockRangeChain({ data: null, error: offline() });

    await expect(getWearsBetween('2025-09-22', '2025-09-28')).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });
});

describe('week hooks', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  });

  it('usePlannedFits reads Monday to Sunday under a per-user, per-week key', async () => {
    const { gte, lte } = mockRangeChain({ data: [], error: null });

    const { result } = await renderHook(() => usePlannedFits('user-1', '2025-09-29'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(gte).toHaveBeenCalledWith('planned_on', '2025-09-29');
    expect(lte).toHaveBeenCalledWith('planned_on', '2025-10-05');
    expect(queryClient.getQueryData(['plannedFits', 'user-1', '2025-09-29'])).toEqual([]);
  });

  it('useWeekWears reads the same week under its own key', async () => {
    const { gte, lte } = mockRangeChain({ data: [], error: null });

    const { result } = await renderHook(() => useWeekWears('user-1', '2025-09-29'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(gte).toHaveBeenCalledWith('worn_on', '2025-09-29');
    expect(lte).toHaveBeenCalledWith('worn_on', '2025-10-05');
    expect(queryClient.getQueryData(['fitWearsRange', 'user-1', '2025-09-29'])).toEqual(new Set());
  });

  it('does not read before there is a signed-in user', async () => {
    mockRangeChain({ data: [], error: null });

    await renderHook(() => usePlannedFits(undefined, '2025-09-29'), { wrapper });
    await renderHook(() => useWeekWears(undefined, '2025-09-29'), { wrapper });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('month hooks', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  });

  it('usePlannedMonth reads the first to the last of the month under a month key', async () => {
    const { gte, lte } = mockRangeChain({ data: [], error: null });

    const { result } = await renderHook(() => usePlannedMonth('user-1', '2026-09-01', true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(gte).toHaveBeenCalledWith('planned_on', '2026-09-01');
    expect(lte).toHaveBeenCalledWith('planned_on', '2026-09-30');
    expect(queryClient.getQueryData(['plannedFits', 'user-1', 'month', '2026-09-01'])).toEqual([]);
  });

  it('useMonthWears reads the same month under its own key', async () => {
    const { gte, lte } = mockRangeChain({ data: [], error: null });

    const { result } = await renderHook(() => useMonthWears('user-1', '2026-02-01', true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(gte).toHaveBeenCalledWith('worn_on', '2026-02-01');
    expect(lte).toHaveBeenCalledWith('worn_on', '2026-02-28');
    expect(queryClient.getQueryData(['fitWearsRange', 'user-1', 'month', '2026-02-01'])).toEqual(new Set());
  });

  it("never shares a week's cache entry, even for a month starting on Monday", async () => {
    // Jun 1 2026 is a Monday, so the month and its first week start on the same date.
    mockRangeChain({ data: [], error: null });

    await renderHook(() => usePlannedMonth('user-1', '2026-06-01', true), { wrapper });

    await waitFor(() => expect(queryClient.getQueryData(['plannedFits', 'user-1', 'month', '2026-06-01'])).toEqual([]));
    expect(queryClient.getQueryData(['plannedFits', 'user-1', '2026-06-01'])).toBeUndefined();
  });

  it('does not read while the month view is off, or before there is a user', async () => {
    mockRangeChain({ data: [], error: null });

    await renderHook(() => usePlannedMonth('user-1', '2026-09-01', false), { wrapper });
    await renderHook(() => useMonthWears('user-1', '2026-09-01', false), { wrapper });
    await renderHook(() => usePlannedMonth(undefined, '2026-09-01', true), { wrapper });
    await renderHook(() => useMonthWears(undefined, '2026-09-01', true), { wrapper });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
