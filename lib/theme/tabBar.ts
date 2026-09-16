import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TAB_BAR_HEIGHT = 68;

const BREATHING_ROOM = 16;

/**
 * Bottom padding a scrollable tab screen needs so its last content isn't
 * hidden behind the floating tab bar. Only matters because the bar is
 * `position: 'absolute'` (screens render full-height behind it) -- that's
 * required for the frosted-glass background to actually have content to
 * blur; with `position: 'relative'`, nothing ever renders underneath it,
 * making the blur a no-op regardless of whether `expo-blur` is linked.
 */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_HEIGHT + BREATHING_ROOM;
}
