import { Pressable, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ChevronLeftIcon } from '@/components/ui/icons/ChevronLeftIcon';
import { colors } from '@/lib/theme/colors';

const BACK_TOUCH_TARGET = 44;

type Props = {
  onPress?: () => void;
  disabled?: boolean;
};

/** Shared back-chevron header for pushed (non-tab, non-modal) screens -- item detail, profile. */
export function BackHeader({ onPress, disabled }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const inkPrimary = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;

  return (
    <View style={{ paddingTop: insets.top + 4 }} className="flex-row items-center px-gutter pb-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onPress ?? (() => router.back())}
        disabled={disabled}
        hitSlop={12}
        style={{
          minWidth: BACK_TOUCH_TARGET,
          minHeight: BACK_TOUCH_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronLeftIcon color={inkPrimary} />
      </Pressable>
    </View>
  );
}
