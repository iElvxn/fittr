import { View } from 'react-native';

import { Text } from '@/components/ui/Text';

/**
 * Shared "no connection" state for all sign-up/sign-in methods and any
 * authenticated screen's data fetches. Lives outside `app/` (unlike its
 * original location under `app/(auth)/components/`) because Expo Router
 * treats every `.tsx` file under `app/` as a route candidate regardless of
 * subfolder name, and this component has no default export.
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
