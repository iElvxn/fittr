import { Pressable, View, useColorScheme, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

type Props = {
  label: string;
  renderIcon: (color: string) => React.ReactNode;
  focused?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Custom renderer for the four real tab destinations (Home, Wardrobe, Fits,
 * Planner). The library's own default tab item can't be reliably centered
 * via `tabBarItemStyle` -- only its `flex` value leaks into the inner
 * button; the hardcoded internal layout keeps `justifyContent: 'flex-start'`
 * and default `alignItems: 'stretch'`, which left-aligns a fixed-width icon
 * and top-anchors short content in a tall slot. This renders icon-above-
 * label with full, direct control over both axes instead.
 *
 * `style` (from React Navigation's per-item layout) is applied to the outer
 * `Pressable` to preserve slot sizing -- it also already carries the
 * active-tab background color/opacity when focused, so that keeps working
 * unmodified; only `alignItems`/`justifyContent: 'center'` are added after it.
 */
export function TabBarButton({ label, renderIcon, focused, onPress, style, accessibilityLabel, testID }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const color = focused ? palette.inkPrimary : palette.inkSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      onPress={onPress}
      style={[style, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {renderIcon(color)}
        {/*
          `numberOfLines`/tightened `lineHeight` -- the "label" type's
          default line-height (20) is generous enough that a wrap (e.g.
          "Wardrobe", the longest label) pushes the block past this item's
          clipped, fixed-height box, reading as vertically shifted relative
          to its one-line siblings instead of just clipped.
        */}
        <Text
          variant="label"
          numberOfLines={1}
          style={{ marginTop: 4, fontSize: 12, lineHeight: 14, color }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
