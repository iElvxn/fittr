import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

/**
 * Shared "no connection" state for all three sign-up methods. Renamed from
 * the ambiguous `sign-in.tsx` in the spec's first draft — this is a shared
 * component, not the (future, Story 1.2) sign-in screen.
 */
export function ConnectionErrorNotice({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      className="rounded-sm border border-border-hairline bg-surface-raised px-4 py-3 dark:border-border-hairlineDark dark:bg-surface-raisedDark"
    >
      <Text variant="body" className="text-ink-primary dark:text-ink-primaryDark">
        {message}
      </Text>
    </View>
  );
}
