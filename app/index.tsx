import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useSession } from '@/lib/auth/useSession';

export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base dark:bg-surface-baseDark">
        <ActivityIndicator />
      </View>
    );
  }

  // No onboarding-completion flag exists yet (Story 1.3's scope), so any
  // existing session on cold start is treated as a returning user and goes
  // straight to Home rather than back through onboarding.
  return <Redirect href={session ? '/(tabs)' : '/(auth)/welcome'} />;
}
