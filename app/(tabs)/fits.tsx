import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

/** Placeholder — real content is Epic 3/4's scope. */
export default function Fits() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
      <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
        Fits are coming soon.
      </Text>
    </View>
  );
}
