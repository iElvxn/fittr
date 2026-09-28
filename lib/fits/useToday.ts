import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Imported from its own module, not defined alongside it, so a test that
// mocks `./localDate` controls what this hook reads.
import { todayLocalDate } from './localDate';

/** Milliseconds from `now` to the next local midnight (23 or 25 hours away across a DST change). */
function msUntilNextMidnight(now: Date) {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return nextMidnight.getTime() - now.getTime();
}

/**
 * The device's local date as `YYYY-MM-DD`, shared by every screen that
 * shows or reads "today". Screens stay mounted (tabs, a pushed Fit detail),
 * so the date is re-read when the app returns to the foreground and at
 * local midnight rather than fixed at mount. `syncToday` re-reads it on
 * demand, e.g. when a tab regains focus. Setting the same date again is a
 * no-op, so a same-day re-read doesn't re-render.
 */
export function useToday() {
  const [today, setToday] = useState(todayLocalDate);

  const syncToday = useCallback(() => {
    setToday(todayLocalDate());
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncToday();
      }
    });
    return () => subscription.remove();
  }, [syncToday]);

  // Rescheduled whenever the date changes (a resume may already have moved
  // it), and after each firing in case the timer ran without the date moving.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      timer = setTimeout(() => {
        syncToday();
        schedule();
      }, msUntilNextMidnight(new Date()));
    }
    schedule();
    return () => clearTimeout(timer);
  }, [today, syncToday]);

  return { today, syncToday };
}
