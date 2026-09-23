import type { ReactNode } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ChevronLeftIcon } from '@/components/ui/icons/ChevronLeftIcon';
import { colors } from '@/lib/theme/colors';

const BACK_TOUCH_TARGET = 44;

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  /** Tighter top/bottom padding for screens that need the header to claim less vertical space (e.g. Fit detail, where the cover and item list below want the room). Default padding is unchanged for every other screen. */
  compact?: boolean;
  /** Optional trailing action (e.g. Fit detail's Share) -- sits opposite the back chevron. Callers that omit it render exactly as before. */
  right?: ReactNode;
};

/** Shared back-chevron header for pushed (non-tab, non-modal) screens -- item detail, profile, Fit detail. */
export function BackHeader({ onPress, disabled, compact, right }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const inkPrimary = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;

  return (
    <View
      style={{ paddingTop: insets.top + (compact ? 0 : 4) }}
      className={['flex-row items-center justify-between px-gutter', compact ? 'pb-0' : 'pb-1'].join(' ')}
    >
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
      {right ?? null}
    </View>
  );
}
