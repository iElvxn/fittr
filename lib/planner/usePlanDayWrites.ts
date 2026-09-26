import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { FitRow } from '@/lib/fits/listFits';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from '@/lib/fits/errors';
import { trackFitPlanned } from '@/lib/analytics/posthog';
import { Sentry } from '@/lib/observability/sentry';
import { planFit, unplanDay } from './plannedFits';
import { daysBetween } from './week';

type Options = {
  userId: string | undefined;
  today: string;
  /** Each date's live Fit -- a plan whose Fit was deleted is absent. */
  planByDate: Map<string, FitRow>;
};

/**
 * The day sheet's state and writes, shared by the Planner and Home so
 * "Plan today's Fit" on Home behaves exactly like the Planner's sheet: one
 * upsert per pick, `fit_planned` on assign or replace, a busy lock while a
 * write is in flight, and the sheet staying open with the error notice when
 * a write fails.
 */
export function usePlanDayWrites({ userId, today, planByDate }: Options) {
  const queryClient = useQueryClient();
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State alone can't stop a second tap landing before the re-render that disables the controls.
  const busyRef = useRef(false);

  const sheetFit = sheetDate ? (planByDate.get(sheetDate) ?? null) : null;

  function openDay(date: string) {
    setWriteError(null);
    setSheetDate(date);
  }

  function closeSheet() {
    if (busyRef.current) {
      return;
    }
    setSheetDate(null);
    setWriteError(null);
  }

  async function runWrite(write: () => Promise<void>, onSuccess?: () => void) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWriteError(null);
    try {
      await write();
      onSuccess?.();
      await queryClient.invalidateQueries({ queryKey: ['plannedFits', userId] });
      setSheetDate(null);
    } catch (error) {
      const offline = isOffline(error);
      if (!offline) {
        Sentry.captureException(error);
      }
      setWriteError(offline ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function pickFit(fitId: string) {
    if (!userId || !sheetDate) {
      return;
    }
    if (fitId === sheetFit?.id) {
      // Already the day's Fit -- nothing to write.
      closeSheet();
      return;
    }
    const date = sheetDate;
    void runWrite(
      () => planFit(userId, date, fitId),
      () => trackFitPlanned(daysBetween(today, date)),
    );
  }

  function removeFit() {
    if (!sheetDate) {
      return;
    }
    const date = sheetDate;
    void runWrite(() => unplanDay(date));
  }

  return { sheetDate, sheetFit, busy, writeError, openDay, closeSheet, pickFit, removeFit };
}
