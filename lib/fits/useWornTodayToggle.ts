import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { trackFitWorn, type FitWornSource } from '@/lib/analytics/posthog';
import { Sentry } from '@/lib/observability/sentry';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from './errors';
import { invalidateWearQueries, markFitWornToday, unmarkFitWornToday } from './markFitWorn';
import { confirmUndoWearWithPhoto } from './wearConfirmations';
import type { WearRef } from './wearRef';

type Options = {
  userId: string | undefined;
  /** The Fit the toggle marks worn today; null when there is none. */
  fitId: string | null;
  /** That Fit's wear today as the server has it (not the optimistic flip), or null if it isn't worn. */
  wear: WearRef | null;
  /** The `fit_worn` source this toggle reports. */
  source: FitWornSource;
  /** Another write shares the lock (e.g. a photo write): the toggle ignores taps while it's true. */
  blocked?: boolean;
};

/**
 * Mark worn / Worn today for one Fit, today only (Stories 5.2 + 5.6), shared
 * by Home's card and the day sheet so both behave the same: same optimistic
 * toggle as Fit detail's Wear today -- flip at once, clear the override once
 * the refetches land, drop it on failure. Keyed by Fit so a changed plan
 * can't inherit another Fit's override. Undoing a wear that has a photo
 * confirms first, since the photo goes with it.
 */
export function useWornTodayToggle({ userId, fitId, wear, source, blocked = false }: Options) {
  const queryClient = useQueryClient();
  const [wornOverride, setWornOverride] = useState<{ fitId: string; worn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // State alone can't stop a second tap landing before the re-render that disables the controls.
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const serverWornToday = Boolean(fitId && wear);
  const override = fitId && wornOverride?.fitId === fitId ? wornOverride.worn : null;
  const isWornToday = override ?? serverWornToday;

  async function toggle() {
    if (!fitId || !userId || busyRef.current || blocked) {
      return;
    }
    const next = !isWornToday;
    // Undoing a wear deletes its photo too, so that one undo asks first.
    if (!next && wear?.photo) {
      busyRef.current = true;
      const confirmed = await confirmUndoWearWithPhoto();
      busyRef.current = false;
      if (!confirmed) {
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setWornOverride({ fitId, worn: next });
    try {
      if (next) {
        await markFitWornToday(userId, fitId);
        trackFitWorn(source);
      } else {
        await unmarkFitWornToday(userId, fitId);
      }
      await invalidateWearQueries(queryClient, userId);
      setWornOverride(null);
    } catch (caught) {
      // Back to the server's state, which the failed write left unchanged --
      // not pinned, so a wear made later elsewhere still shows.
      setWornOverride(null);
      const offline = isOffline(caught);
      if (!offline) {
        Sentry.captureException(caught);
      }
      setError(offline ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Reads the lock itself, for a guard that can't wait for the re-render. */
  function isBusy() {
    return busyRef.current;
  }

  function clearError() {
    setError(null);
  }

  return { isWornToday, serverWornToday, override, busy, error, toggle, isBusy, clearError };
}
