import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { isOffline } from '@/lib/fits/errors';

/**
 * The app's one `QueryClient`, on React Native defaults rather than the web's.
 * `networkMode: 'always'` because the default `'online'` pauses queries while
 * offline -- no data, no error, no loading state -- which would break the
 * block-and-keep "No connection" notices. A no-connection error is never
 * retried, so that notice shows after one request.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        networkMode: 'always',
        // Explicit: with `networkMode: 'always'` the default is `false`.
        // `true` refetches stale reads, and a read that failed is stale.
        refetchOnReconnect: true,
        retry: (failureCount, error) => !isOffline(error) && failureCount < 2,
      },
    },
  });
}

/**
 * Tells React Query when the app is in the foreground and when it's online,
 * so stale reads refetch on resume and every failed read on reconnect.
 * Separate from the factory so tests that build a client register nothing.
 */
export function registerQueryManagers() {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (status) => setFocused(status === 'active'));
    return () => subscription.remove();
  });

  onlineManager.setEventListener((setOnline) => {
    // An unknown state (`null`, e.g. mid network switch) counts as online:
    // with `networkMode: 'always'` it never blocks a request.
    const isOnline = (state: Network.NetworkState) => state.isConnected !== false;
    let changed = false;

    // The listener reports only changes, so an app launched offline would
    // otherwise stay "online" and its first reconnect would refetch nothing.
    Network.getNetworkStateAsync()
      .then((state) => {
        if (!changed) {
          setOnline(isOnline(state));
        }
      })
      .catch(() => {});

    const subscription = Network.addNetworkStateListener((state) => {
      changed = true;
      setOnline(isOnline(state));
    });
    return () => subscription.remove();
  });
}
