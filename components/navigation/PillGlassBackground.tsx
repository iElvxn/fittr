import { StyleSheet, View, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';

type Props = {
  radius: number;
};

/**
 * The floating tab bar's frosted-glass fill. Self-clipping (its own
 * `borderRadius` + `overflow: 'hidden'`) rather than relying on the tab
 * bar's own container to clip it -- that container also carries a drop
 * shadow, and `overflow: 'hidden'` there would clip the shadow along with
 * the blur (a well-known RN gotcha). A translucent `surfaceRaised` tint
 * (#FFFDF8 / #24211E) sits above the blur so the bar reads as this app's
 * own cream surface, not just whatever generic tint the platform blur
 * defaults to, and stays legible over busy content (e.g. the wardrobe
 * grid) scrolling underneath.
 */
export function PillGlassBackground({ radius }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <View style={{ flex: 1, borderRadius: radius, overflow: 'hidden' }}>
      <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      {/*
        Kept light -- an opaque-leaning tint here (an earlier version used
        0.45/0.55) can visually bury the blur underneath it entirely, which
        looks identical to the blur not working at all.
      */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(36,33,30,0.22)' : 'rgba(255,253,248,0.25)' },
        ]}
      />
    </View>
  );
}
