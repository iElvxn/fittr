import { Pressable, View, useColorScheme, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import { colors } from '@/lib/theme/colors';

const CIRCLE_SIZE = 52;

type Props = {
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The tab bar's center action -- replaces the "Fits" tab slot (still an
 * unbuilt Phase 2 placeholder) with the app's actual highest-value action,
 * "Add item," one tap away from anywhere. Sits flush and vertically
 * centered within the bar, like the other tabs, just ink-filled and
 * icon-only to stand out (fill = `inkPrimary`, glyph = `surfaceBase`, the
 * same inverse pair as the primary `Button`, so it flips with the scheme).
 *
 * The received `style` (from React Navigation's per-item layout, which
 * varies its flexDirection/justifyContent by platform/variant) is applied
 * to the outer `Pressable` only to preserve its slot sizing (flex, padding)
 * -- `alignItems`/`justifyContent: 'center'` are forced after it so the
 * visible circle centers correctly regardless of that base layout.
 */
export function AddItemTabButton({ onPress, style }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add item"
      onPress={onPress}
      hitSlop={8}
      style={[style, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <View
        style={{
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          borderRadius: CIRCLE_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.inkPrimary,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        }}
      >
        <PlusIcon size={24} color={palette.surfaceBase} />
      </View>
    </Pressable>
  );
}
