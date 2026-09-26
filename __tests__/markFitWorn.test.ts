import { AuthRetryableFetchError } from '@supabase/supabase-js';

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { QueryClient } from '@tanstack/react-query';

import { invalidateWearQueries, markFitWornToday, unmarkFitWornToday } from '@/lib/fits/markFitWorn';
import { supabase } from '@/lib/supabase';

function mockInsertChain(result: { error: unknown }) {
  const insert = jest.fn().mockResolvedValue(result);
  (supabase.from as jest.Mock).mockReturnValue({ insert });
  return { insert };
}

function mockDeleteChain(result: { error: unknown }) {
  const eq3 = jest.fn().mockResolvedValue(result);
  const eq2 = jest.fn().mockReturnValue({ eq: eq3 });
  const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
  const del = jest.fn().mockReturnValue({ eq: eq1 });
  (supabase.from as jest.Mock).mockReturnValue({ delete: del });
  return { del, eq1, eq2, eq3 };
}

beforeEach(() => {
  mockUuidCounter = 0;
  // Fixed local time straddling a UTC day boundary (23:30 local, which
  // would be the *next* UTC day) -- catches a `toISOString()`-based
  // implementation, which would record tomorrow's date instead of today's.
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21, 23, 30, 0));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('markFitWornToday', () => {
  it('inserts a fit_wears row for the local calendar date', async () => {
    const { insert } = mockInsertChain({ error: null });

    await markFitWornToday('user-1', 'fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(insert).toHaveBeenCalledWith({
      id: 'uuid-1',
      user_id: 'user-1',
      fit_id: 'fit-1',
      worn_on: '2026-09-21',
    });
  });

  it('classifies a no-connection failure', async () => {
    mockInsertChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(markFitWornToday('user-1', 'fit-1')).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('rethrows other errors', async () => {
    mockInsertChain({ error: new Error('boom') });

    await expect(markFitWornToday('user-1', 'fit-1')).rejects.toThrow('boom');
  });

  it("treats a unique-constraint violation (already worn today) as a no-op, not an error", async () => {
    mockInsertChain({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } });

    await expect(markFitWornToday('user-1', 'fit-1')).resolves.toBeUndefined();
  });
});

describe('unmarkFitWornToday', () => {
  it("deletes only today's row for this user and fit", async () => {
    const { del, eq1, eq2, eq3 } = mockDeleteChain({ error: null });

    await unmarkFitWornToday('user-1', 'fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(del).toHaveBeenCalled();
    expect(eq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eq2).toHaveBeenCalledWith('fit_id', 'fit-1');
    expect(eq3).toHaveBeenCalledWith('worn_on', '2026-09-21');
  });

  it('classifies a no-connection failure', async () => {
    mockDeleteChain({ error: new AuthRetryableFetchError('network request failed', 0) });

    await expect(unmarkFitWornToday('user-1', 'fit-1')).rejects.toMatchObject({
      name: 'FitError',
      kind: 'no_connection',
    });
  });

  it('rethrows other errors', async () => {
    mockDeleteChain({ error: new Error('boom') });

    await expect(unmarkFitWornToday('user-1', 'fit-1')).rejects.toThrow('boom');
  });
});

describe('invalidateWearQueries', () => {
  it('invalidates every wear read for the user, and only theirs', async () => {
    const queryClient = new QueryClient();
    const keys = [
      ['wornFitIds', 'user-1'],
      ['todayWornFitIds', 'user-1'],
      ['fitWearsRange', 'user-1', '2026-09-21'],
      ['wearDates', 'user-1'],
      ['wearDates', 'user-2'],
      ['plannedFits', 'user-1', '2026-09-21'],
    ];
    for (const key of keys) {
      queryClient.setQueryData(key, 'cached');
    }

    await invalidateWearQueries(queryClient, 'user-1');

    const invalidated = (key: string[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(keys.slice(0, 4).every(invalidated)).toBe(true);
    expect(invalidated(['wearDates', 'user-2'])).toBe(false);
    expect(invalidated(['plannedFits', 'user-1', '2026-09-21'])).toBe(false);
  });
});
