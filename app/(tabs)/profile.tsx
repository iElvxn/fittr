import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/app/(auth)/components/ConnectionErrorNotice';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/auth/useSession';
import { NO_CONNECTION_MESSAGE } from '@/lib/auth/errors';

export default function Profile() {
  const { session } = useSession();
  const userId = session?.user.id;

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId as string)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: Boolean(userId),
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/welcome');
  }

  return (
    <View className="flex-1 justify-between bg-surface-base px-gutter py-10 dark:bg-surface-baseDark">
      <View className="items-center pt-10">
        {isLoading ? (
          <ActivityIndicator />
        ) : isError ? (
          <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
        ) : (
          <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
            {profile?.display_name}
          </Text>
        )}
      </View>

      <Button title="Sign Out" onPress={handleSignOut} />
    </View>
  );
}
