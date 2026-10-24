import '../global.css';

import { useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostHogProvider } from 'posthog-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { appFonts } from '@/lib/theme/fonts';
import { navigationLightTheme, navigationDarkTheme } from '@/lib/theme/navigationTheme';
import { initSentry, Sentry } from '@/lib/observability/sentry';
import { posthog } from '@/lib/analytics/posthog';
import { SessionProvider } from '@/lib/auth/useSession';
import { RootNavigator } from '@/components/navigation/RootStack';

initSentry();

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — splash may already be hidden (e.g. fast refresh)
});

const queryClient = new QueryClient();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const scheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === 'dark' ? navigationDarkTheme : navigationLightTheme}>
          <PostHogProvider client={posthog}>
            <QueryClientProvider client={queryClient}>
              {/* Inside QueryClientProvider so SIGNED_OUT can clear the cache. */}
              <SessionProvider>
                <RootNavigator fontsReady={fontsLoaded || Boolean(fontError)} />
              </SessionProvider>
            </QueryClientProvider>
          </PostHogProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
