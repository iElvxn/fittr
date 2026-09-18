jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { getNextFitName } from '@/lib/fits/nextFitName';
import { supabase } from '@/lib/supabase';

type CountQuery = {
  select: jest.Mock<CountQuery, unknown[]>;
  eq: jest.Mock<CountQuery, unknown[]>;
  is: jest.Mock<CountQuery, unknown[]>;
  then: (resolve: (value: { count: number | null; error: unknown }) => void) => void;
};

/** Minimal thenable chain mirroring the real Supabase query builder's `.select().eq().is()` shape. */
function makeCountQuery(result: { count: number | null; error: unknown }): CountQuery {
  const query: CountQuery = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    then: (resolve) => resolve(result),
  };
  return query;
}

describe('getNextFitName', () => {
  it('returns "Fit 1" when the user has no saved fits', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeCountQuery({ count: 0, error: null }));

    await expect(getNextFitName('user-1')).resolves.toBe('Fit 1');
  });

  it('returns count + 1 when the user already has saved fits', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeCountQuery({ count: 11, error: null }));

    await expect(getNextFitName('user-1')).resolves.toBe('Fit 12');
  });

  it('scopes the count to this user and excludes soft-deleted fits', async () => {
    const query = makeCountQuery({ count: 3, error: null });
    (supabase.from as jest.Mock).mockReturnValue(query);

    await getNextFitName('user-1');

    expect(supabase.from).toHaveBeenCalledWith('fits');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('rethrows a query error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeCountQuery({ count: null, error: new Error('boom') }));

    await expect(getNextFitName('user-1')).rejects.toThrow('boom');
  });
});
