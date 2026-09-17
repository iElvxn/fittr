import '../global.css';

import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, ThemeProvider } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostHogProvider } from 'posthog-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { appFonts } from '@/lib/theme/fonts';
import { navigationLightTheme, navigationDarkTheme } from '@/lib/theme/navigationTheme';
import { initSentry, Sentry } from '@/lib/observability/sentry';
import { posthog } from '@/lib/analytics/posthog';

initSentry();

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — splash may already be hidden (e.g. fast refresh)
});

const queryClient = new QueryClient();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const scheme = useColorScheme();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === 'dark' ? navigationDarkTheme : navigationLightTheme}>
          <PostHogProvider client={posthog}>
            <QueryClientProvider client={queryClient}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="add-item" options={{ presentation: 'modal' }} />
                <Stack.Screen name="new-fit" options={{ presentation: 'modal' }} />
                <Stack.Screen name="item/[id]" />
                <Stack.Screen name="profile" />
              </Stack>
            </QueryClientProvider>
          </PostHogProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
