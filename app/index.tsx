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

  return <Redirect href={session ? '/onboarding' : '/(auth)/welcome'} />;
}
