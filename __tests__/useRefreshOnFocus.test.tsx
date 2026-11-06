import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

import { useFocusEffect } from 'expo-router';
import { useRefreshOnFocus } from '@/lib/query/useRefreshOnFocus';

/** The latest focus callback the hook registered, called as a focus would. */
function focus() {
  const onFocus = (useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
  return onFocus();
}

async function renderRefreshOnFocus() {
  const queryClient = new QueryClient();
  const refetchQueries = jest.spyOn(queryClient, 'refetchQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await renderHook(() => useRefreshOnFocus(), { wrapper });
  return refetchQueries;
}

describe('useRefreshOnFocus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips the first focus, which the mount already fetched for', async () => {
    const refetchQueries = await renderRefreshOnFocus();

    focus();

    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it('refetches only stale active queries on a later focus, leaving one in flight running', async () => {
    const refetchQueries = await renderRefreshOnFocus();
    focus();

    focus();

    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(refetchQueries).toHaveBeenCalledWith({ type: 'active', stale: true }, { cancelRefetch: false });
  });

  it('sends a request for a stale read and none for a fresh or disabled one', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const stale = jest.fn().mockResolvedValue('data');
    const fresh = jest.fn().mockResolvedValue('data');
    const disabled = jest.fn().mockResolvedValue('data');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    await renderHook(
      () => {
        useRefreshOnFocus();
        useQuery({ queryKey: ['stale'], queryFn: stale, staleTime: 0 });
        useQuery({ queryKey: ['fresh'], queryFn: fresh, staleTime: 60_000 });
        useQuery({ queryKey: ['disabled'], queryFn: disabled, enabled: false });
      },
      { wrapper },
    );
    await waitFor(() => expect(queryClient.getQueryState(['fresh'])?.status).toBe('success'));
    await waitFor(() => expect(queryClient.getQueryState(['stale'])?.status).toBe('success'));
    focus();

    await act(async () => focus());

    await waitFor(() => expect(stale).toHaveBeenCalledTimes(2));
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(disabled).not.toHaveBeenCalled();
  });

  it('returns no cleanup from the focus effect', async () => {
    await renderRefreshOnFocus();
    focus();

    expect(focus()).toBeUndefined();
  });
});
