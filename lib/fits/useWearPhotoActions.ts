import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Sentry } from '@/lib/observability/sentry';
import { isOffline, NO_CONNECTION_MESSAGE, UNKNOWN_ERROR_MESSAGE } from './errors';
import { invalidateWearQueries } from './markFitWorn';
import { chooseWearPhotoSource, pickWearPhoto, removeWearPhoto, saveWearPhoto, type WearRef } from './wearPhoto';
import { confirmRemoveWearPhoto, explainCameraDenied } from './wearConfirmations';

/**
 * Story 5.4: adding, replacing and removing a wear's photo, shared by the
 * Planner's day sheet and Home so a photo behaves the same wherever it's
 * taken. Same shape as `usePlanDayWrites`: a busy lock from the first tap
 * (the source sheet included) until the refetch lands, and a no-connection
 * or unknown-error message on failure. After a write every wear read is
 * refetched, so the same photo shows on every screen.
 */
export function useWearPhotoActions(userId: string | undefined) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // State alone can't stop a second tap landing before the re-render that disables the controls.
  const busyRef = useRef(false);
  /** The picked file, shown under the "Saving" veil until the saved photo replaces it. */
  const [saving, setSaving] = useState<{ wearId: string; uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(work: (uid: string) => Promise<void>) {
    if (busyRef.current || !userId) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await work(userId);
    } catch (caught) {
      const offline = isOffline(caught);
      if (!offline) {
        Sentry.captureException(caught);
      }
      setError(offline ? NO_CONNECTION_MESSAGE : UNKNOWN_ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setSaving(null);
    }
  }

  /** Add, or replace when the wear already has one -- the save cleans up the old files. */
  function addPhoto(wear: WearRef) {
    void run(async (uid) => {
      const source = await chooseWearPhotoSource();
      if (!source) {
        return;
      }
      const picked = await pickWearPhoto(source);
      if ('denied' in picked) {
        explainCameraDenied();
        return;
      }
      if ('cancelled' in picked) {
        return;
      }
      setSaving({ wearId: wear.id, uri: picked.uri });
      await saveWearPhoto(uid, wear, picked.uri);
      await invalidateWearQueries(queryClient, uid);
    });
  }

  function removePhoto(wear: WearRef) {
    void run(async (uid) => {
      if (!(await confirmRemoveWearPhoto())) {
        return;
      }
      await removeWearPhoto(wear);
      await invalidateWearQueries(queryClient, uid);
    });
  }

  function clearError() {
    setError(null);
  }

  return { busy, saving, error, addPhoto, removePhoto, clearError };
}
