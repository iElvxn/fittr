import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

/** Placeholder — real content is Epic 2's scope. */
export default function Wardrobe() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
      <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
        Wardrobe is coming soon.
      </Text>
    </View>
  );
}
