import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlannerView = 'week' | 'month';

const KEY = 'fittr.planner.view';

/**
 * The Planner's last-used view, kept on the device. A UI preference, not
 * user data, so plain AsyncStorage (unlike the encrypted session store in
 * `lib/supabase.ts`). Anything unexpected -- nothing stored, an unknown
 * value, a failed read -- is Week.
 */
export async function loadPlannerView(): Promise<PlannerView> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

/** Best effort: a failed write only means the next launch opens on Week. */
export async function savePlannerView(view: PlannerView): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, view);
  } catch {
    // Nothing to recover -- see above.
  }
}
