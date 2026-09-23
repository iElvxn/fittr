import { Pressable, useColorScheme, type GestureResponderEvent } from 'react-native';

import { PlusIcon } from '@/components/ui/icons/PlusIcon';
import { colors } from '@/lib/theme/colors';

const CIRCLE_SIZE = 44;

type Props = {
  accessibilityLabel: string;
  onPress?: (event: GestureResponderEvent) => void;
};

/**
 * Same ink-filled circle + plus glyph as the tab bar's "Add item"
 * button (`AddItemTabButton`), sized for inline header use (44pt, this
 * app's minimum touch target) rather than a tab-bar slot.
 */
export function CirclePlusButton({ accessibilityLabel, onPress }: Props) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
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
      <PlusIcon size={20} color={palette.surfaceBase} />
    </Pressable>
  );
}
