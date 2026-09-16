import '../global.css';

import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostHogProvider } from 'posthog-react-native';

import { appFonts } from '@/lib/theme/fonts';
import { initSentry, Sentry } from '@/lib/observability/sentry';
import { posthog } from '@/lib/analytics/posthog';

initSentry();

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — splash may already be hidden (e.g. fast refresh)
});

const queryClient = new QueryClient();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <PostHogProvider client={posthog}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-item" options={{ presentation: 'modal' }} />
        </Stack>
      </QueryClientProvider>
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
