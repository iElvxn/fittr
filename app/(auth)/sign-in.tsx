import { View } from 'react-native';
import { Stack } from 'expo-router';

import { Text } from '@/components/ui/Text';

/**
 * Placeholder target for the "account already exists — sign in instead"
 * link (I/O matrix, Story 1.1's duplicate-email case). Full sign-in/sign-out
 * is Story 1.2's scope — this route exists so the link has somewhere real
 * to go, not so this screen is a finished feature.
 */
export default function SignInPlaceholder() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
      <Stack.Screen options={{ title: 'Sign In' }} />
      <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
        Sign in
      </Text>
      <Text variant="body" className="mt-2 text-center text-ink-secondary dark:text-ink-secondaryDark">
        Sign-in is being built next (Story 1.2). Your account was found — check back shortly.
      </Text>
    </View>
  );
}
