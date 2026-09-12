import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { supabase } from '@/lib/supabase';

/**
 * Placeholder landing screen after a successful sign-up. Story 1.3 builds
 * the real onboarding (display name, avatar, guided "add 5 items"); this
 * story only needs a real route to land on, per the acceptance criteria.
 */
export default function Onboarding() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
      <Text variant="display" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
        Welcome to Fittr
      </Text>
      <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
        Your account is ready. Onboarding (display name, avatar, first items) is coming in the next
        update.
      </Text>
      {__DEV__ && (
        <Pressable onPress={() => supabase.auth.signOut()} className="mt-6">
          <Text variant="body" className="text-ink-secondary underline dark:text-ink-secondaryDark">
            [dev] Sign out
          </Text>
        </Pressable>
      )}
    </View>
  );
}
