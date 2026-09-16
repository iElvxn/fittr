import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

const TAB_COUNT = 5;
const WIDTH_SQUEEZE = 0.6;
const HEIGHT_STRETCH = 1.3;
const POP_MS = 110;
const SETTLE_MS = 150;
const EASE = Easing.out(Easing.cubic);

/** Index within the bar's 5 equal-width slots (Home, Closet, Add, Fits, Planner). */
const ROUTE_INDEX: Record<string, number> = {
  '/': 0,
  '/wardrobe': 1,
  '/fits': 3,
  '/planner': 4,
};

type Props = {
  barWidth: number;
  barHeight: number;
  inset: number;
};

/**
 * The active tab's moving highlight -- a single shared element rather than
 * each tab toggling its own static background, so it can move and "pop
 * then settle" between tabs (the Depop/Instagram tab-morph convention this
 * was modeled on). Position is computed analytically from the current
 * pathname and slot count rather than measured via `onLayout` -- all 5
 * slots are equal-width flex items, so `index * (barWidth / 5)` is exact.
 *
 * Plain eased `withTiming` throughout, not `withSpring` -- a spring's
 * oscillation read as "too bouncy" and dragged out the total transition;
 * timing with an ease-out curve gets a snappier, fully predictable motion
 * with no overshoot. Width and height move opposite ways during the first
 * phase (width squeezes narrow, height stretches tall -- a "pinch" rather
 * than a uniform pop), then both settle back to their real size in the
 * second phase, scaled from the same center point so it stays symmetric
 * in both axes throughout.
 *
 * Rendered inside the same `tabBarBackground` slot as `PillGlassBackground`
 * (see `(tabs)/_layout.tsx`), behind the row of tab buttons -- that slot is
 * `pointerEvents: 'none'`, so this stays purely decorative. Never targets
 * the "Add" slot (index 2); that action isn't a real navigable tab.
 */
export function AnimatedActiveIndicator({ barWidth, barHeight, inset }: Props) {
  const pathname = usePathname();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const slotWidth = barWidth / TAB_COUNT;
  const slotHeight = barHeight - inset * 2;
  const targetIndex = ROUTE_INDEX[pathname] ?? 0;
  const targetX = targetIndex * slotWidth;
  const centerY = barHeight / 2;

  const translateX = useSharedValue(targetX);
  const width = useSharedValue(slotWidth);
  const height = useSharedValue(slotHeight);

  useEffect(() => {
    translateX.value = withTiming(targetX, { duration: POP_MS + SETTLE_MS, easing: EASE });
    // Pinch (narrow + tall), then stretch into the real destination size.
    width.value = withSequence(
      withTiming(slotWidth * WIDTH_SQUEEZE, { duration: POP_MS, easing: EASE }),
      withTiming(slotWidth, { duration: SETTLE_MS, easing: EASE }),
    );
    height.value = withSequence(
      withTiming(slotHeight * HEIGHT_STRETCH, { duration: POP_MS, easing: EASE }),
      withTiming(slotHeight, { duration: SETTLE_MS, easing: EASE }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs, not reactive deps
  }, [targetX, slotWidth, slotHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: height.value,
    top: centerY - height.value / 2,
    transform: [{ translateX: translateX.value + (slotWidth - width.value) / 2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        // A large fixed radius, not a computed one -- RN clamps border
        // radius to half the shorter side automatically, so this always
        // renders a true pill/stadium shape regardless of the animated size.
        { position: 'absolute', borderRadius: 999, overflow: 'hidden' },
        animatedStyle,
      ]}
    >
      <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(245,243,241,0.16)' : 'rgba(28,25,23,0.10)' },
        ]}
      />
    </Animated.View>
  );
}
