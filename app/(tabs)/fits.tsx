import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';

const ACK_DURATION_MS = 2500;

/**
 * My Fits grid is Epic 4's scope -- until then, this screen is just the
 * empty-state entry point into the Fit builder (EXPERIENCE.md's State
 * Patterns: Empty / My Fits -> "Build your first Fit." -> Fit builder).
 */
export default function Fits() {
  const insets = useSafeAreaInsets();

  const { fitSaved } = useLocalSearchParams<{ fitSaved?: string }>();
  // Derived directly from the route param, not mirrored into local state --
  // same convention as `wardrobe.tsx`'s `itemAdded` ack.
  const showAck = fitSaved === '1';

  useEffect(() => {
    if (!showAck) {
      return;
    }

    const timeout = setTimeout(() => router.setParams({ fitSaved: undefined }), ACK_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [showAck]);

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark">
      <View
        style={{ paddingTop: insets.top + 12 }}
        className="border-b border-border-hairline px-gutter pb-4 dark:border-border-hairlineDark"
      >
        {showAck ? (
          <Text
            accessibilityRole="alert"
            variant="body"
            className="mb-4 text-ink-primary dark:text-ink-primaryDark"
          >
            Fit saved.
          </Text>
        ) : null}
        <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
          My Fits
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-gutter">
        <Text variant="body" className="mb-6 text-center text-ink-secondary dark:text-ink-secondaryDark">
          Build your first Fit.
        </Text>
        <Button title="New Fit" variant="primary" onPress={() => router.push('/new-fit')} />
      </View>
    </View>
  );
}
