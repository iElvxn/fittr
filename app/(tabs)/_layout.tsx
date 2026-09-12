import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

import { colors } from '@/lib/theme/colors';
import { useSession } from '@/lib/auth/useSession';

/**
 * Text-only tab bar (no icons): `@expo/vector-icons` isn't an installed
 * dependency, and DESIGN.md's monochrome, typography-led language doesn't
 * require icons for a 5-item tab bar.
 */
export default function TabsLayout() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base dark:bg-surface-baseDark">
        <ActivityIndicator />
      </View>
    );
  }

  // A session can go null while a tab is mounted — expiry, or being signed
  // out remotely — not just at cold start (which app/index.tsx already
  // guards). Without this, an authenticated screen like Profile is left
  // rendering against no user with no way back to Welcome.
  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.inkPrimary,
        tabBarInactiveTintColor: palette.inkSecondary,
        tabBarStyle: {
          backgroundColor: palette.surfaceBase,
          borderTopColor: palette.borderHairline,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe' }} />
      <Tabs.Screen name="fits" options={{ title: 'Fits' }} />
      <Tabs.Screen name="planner" options={{ title: 'Planner' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
