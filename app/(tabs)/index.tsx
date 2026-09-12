import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

/**
 * Placeholder Home tab. Today's planned Fit, quick actions, and onboarding
 * progress (per EXPERIENCE.md) are later epics' scope — this story only
 * needs a real landing surface for sign-in to route to.
 */
export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
      <Text variant="display" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
        Fittr
      </Text>
      <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
        Your wardrobe, fits, and planner are coming soon.
      </Text>
    </View>
  );
}
