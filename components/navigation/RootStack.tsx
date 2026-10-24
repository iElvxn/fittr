import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';

import { useSession } from '@/lib/auth/useSession';

/**
 * The root navigator's route guards. `index` stays unguarded and first: when
 * a guard flips (sign-in, sign-out, expiry, remote revoke), Expo Router moves
 * to the first screen still available, and `index` makes the one decision
 * about where a session goes next. A deep link into a guarded route while
 * signed out lands there too, and from there on Welcome.
 *
 * Lives outside `app/` so it isn't treated as a route, which also lets tests
 * render it through `expo-router/testing-library`.
 */
export function RootStack() {
  const { session } = useSession();
  const signedIn = Boolean(session);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-item" options={{ presentation: 'modal' }} />
        <Stack.Screen name="new-fit" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="fit/[id]" />
        <Stack.Screen name="profile" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Keeps the splash up until fonts **and** the first session read are ready,
 * and only then renders the guarded stack. Rendering the guards earlier, with
 * the session still null, would bounce a signed-in cold-start deep link
 * (e.g. `fittr://fit/abc`) to Welcome.
 */
export function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { loading } = useSession();
  const ready = fontsReady && !loading;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return <RootStack />;
}
