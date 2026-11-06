import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Refetches stale reads when a screen regains focus -- tabs stay mounted, so
 * returning to one never refetches on its own (TanStack's React Native
 * guide). The first focus is skipped: the mount already fetched.
 *
 * Covers every stale read on every mounted screen, not just this one's:
 * scoping it per screen would mean a key list to keep in sync, to save a few
 * requests at most once a minute. `'active'` leaves out disabled queries (the
 * Planner's month while the week shows), and `cancelRefetch: false` leaves a
 * refetch already in flight, such as a write's invalidation, running.
 */
export function useRefreshOnFocus() {
  const queryClient = useQueryClient();
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void queryClient.refetchQueries({ type: 'active', stale: true }, { cancelRefetch: false });
    }, [queryClient]),
  );
}
