jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { getFitWearPhotos, useFitWearPhotos } from '@/lib/fits/fitWearPhotos';
import { supabase } from '@/lib/supabase';

function mockChain(result: { data: unknown; error: unknown }) {
  const order = jest.fn().mockResolvedValue(result);
  const not = jest.fn().mockReturnValue({ order });
  const eq = jest.fn().mockReturnValue({ not });
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  return { select, eq, not, order };
}

const ROW_A = {
  id: 'wear-a',
  worn_on: '2026-09-27',
  photo_path: 'user-1/wear-a/p.webp',
  photo_thumb_path: 'user-1/wear-a/p_thumb.webp',
  photo_thumbhash: 'hash-a',
};
const ROW_B = {
  id: 'wear-b',
  worn_on: '2026-09-19',
  photo_path: 'user-1/wear-b/p.webp',
  photo_thumb_path: 'user-1/wear-b/p_thumb.webp',
  photo_thumbhash: null,
};

beforeEach(() => jest.clearAllMocks());

describe('getFitWearPhotos', () => {
  it("reads the Fit's wears that have a photo, newest first", async () => {
    const { select, eq, not, order } = mockChain({ data: [ROW_A, ROW_B], error: null });

    const photos = await getFitWearPhotos('fit-1');

    expect(supabase.from).toHaveBeenCalledWith('fit_wears');
    expect(select).toHaveBeenCalledWith('id, worn_on, photo_path, photo_thumb_path, photo_thumbhash');
    expect(eq).toHaveBeenCalledWith('fit_id', 'fit-1');
    expect(not).toHaveBeenCalledWith('photo_path', 'is', null);
    expect(order).toHaveBeenCalledWith('worn_on', { ascending: false });
    expect(photos).toEqual([
      {
        id: 'wear-a',
        wornOn: '2026-09-27',
        photo: { path: 'user-1/wear-a/p.webp', thumbPath: 'user-1/wear-a/p_thumb.webp', thumbhash: 'hash-a' },
      },
      {
        id: 'wear-b',
        wornOn: '2026-09-19',
        photo: { path: 'user-1/wear-b/p.webp', thumbPath: 'user-1/wear-b/p_thumb.webp', thumbhash: null },
      },
    ]);
  });

  it('drops a row without a complete photo', async () => {
    mockChain({ data: [{ ...ROW_A, photo_thumb_path: null }, ROW_B], error: null });

    const photos = await getFitWearPhotos('fit-1');

    expect(photos.map((photo) => photo.id)).toEqual(['wear-b']);
  });

  it('treats a null payload as no photos', async () => {
    mockChain({ data: null, error: null });

    await expect(getFitWearPhotos('fit-1')).resolves.toEqual([]);
  });

  it('classifies a no-connection failure', async () => {
    mockChain({ data: null, error: new AuthRetryableFetchError('offline', 0) });

    await expect(getFitWearPhotos('fit-1')).rejects.toMatchObject({ name: 'FitError', kind: 'no_connection' });
  });

  it('rethrows other errors', async () => {
    mockChain({ data: null, error: new Error('boom') });

    await expect(getFitWearPhotos('fit-1')).rejects.toThrow('boom');
  });
});

describe('useFitWearPhotos', () => {
  it("caches under ['fitWearPhotos', userId, fitId], under the prefix every wear write invalidates", async () => {
    mockChain({ data: [ROW_B], error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = await renderHook(() => useFitWearPhotos('user-1', 'fit-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['fitWearPhotos', 'user-1', 'fit-1'])).toHaveLength(1);
  });

  it('waits for both the user and the Fit', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = await renderHook(() => useFitWearPhotos('user-1', undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
