import { Pressable, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { PersonIcon } from '@/components/ui/icons/PersonIcon';
import { colors } from '@/lib/theme/colors';

const PROFILE_TOUCH_TARGET = 44;

/**
 * Placeholder Home tab. Today's planned Fit, quick actions, and onboarding
 * progress (per EXPERIENCE.md) are later epics' scope — this story only
 * needs a real landing surface for sign-in to route to.
 *
 * Profile lives here as a top-right icon rather than its own tab (see
 * `(tabs)/_layout.tsx`) -- a top-level pushed route, not a tab destination.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const inkPrimary = scheme === 'dark' ? colors.dark.inkPrimary : colors.light.inkPrimary;

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      <View style={{ paddingTop: insets.top + 4 }} className="flex-row justify-end px-gutter pb-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => router.push('/profile')}
          hitSlop={8}
          style={{
            width: PROFILE_TOUCH_TARGET,
            height: PROFILE_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PersonIcon color={inkPrimary} />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center px-gutter">
        <Text variant="display" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
          Fittr
        </Text>
        <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
          Your wardrobe, fits, and planner are coming soon.
        </Text>
      </View>
    </View>
  );
}
