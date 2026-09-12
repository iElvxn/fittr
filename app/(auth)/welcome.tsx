import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppleGlyph } from '@/components/ui/AppleGlyph';
import { GoogleGlyph } from '@/components/ui/GoogleGlyph';
import { ConnectionErrorNotice } from '@/app/(auth)/components/ConnectionErrorNotice';
import { signUpWithApple } from '@/lib/auth/appleSignIn';
import { signUpWithGoogle } from '@/lib/auth/googleSignIn';
import { isNoConnectionError, NO_CONNECTION_MESSAGE } from '@/lib/auth/errors';

type Busy = 'apple' | 'google' | null;

export default function Welcome() {
  const [busy, setBusy] = useState<Busy>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [genericError, setGenericError] = useState(false);

  async function handleApple() {
    setConnectionError(false);
    setGenericError(false);
    setBusy('apple');
    try {
      const result = await signUpWithApple();
      if (result.status === 'success') {
        router.replace('/onboarding');
      }
      // 'cancelled' — normal path, silently stay on Welcome, no error shown.
    } catch (error) {
      if (isNoConnectionError(error)) {
        setConnectionError(true);
      } else {
        setGenericError(true);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setConnectionError(false);
    setGenericError(false);
    setBusy('google');
    try {
      const result = await signUpWithGoogle();
      if (result.status === 'success') {
        router.replace('/onboarding');
      }
      // 'cancelled' — normal path, silently stay on Welcome, no error shown.
    } catch (error) {
      if (isNoConnectionError(error)) {
        setConnectionError(true);
      } else {
        setGenericError(true);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="flex-1 justify-center bg-surface-base px-gutter dark:bg-surface-baseDark">
      <Stack.Screen options={{ headerShown: false }} />

      <Text variant="display" className="mb-2 text-center text-ink-primary dark:text-ink-primaryDark">
        Fittr
      </Text>
      <Text
        variant="body"
        className="mb-10 text-center text-ink-secondary dark:text-ink-secondaryDark"
      >
        Your wardrobe, organized.
      </Text>

      {connectionError ? (
        <View className="mb-4">
          <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
        </View>
      ) : null}

      {genericError ? (
        <View className="mb-4">
          <ConnectionErrorNotice message="Something went wrong. Please try again." />
        </View>
      ) : null}

      <View className="gap-3">
        <Button
          title="Sign in with Apple"
          leftIcon={<AppleGlyph />}
          loading={busy === 'apple'}
          disabled={busy !== null}
          onPress={handleApple}
        />
        <Button
          title="Continue with Google"
          leftIcon={<GoogleGlyph />}
          loading={busy === 'google'}
          disabled={busy !== null}
          onPress={handleGoogle}
        />
        <Button
          title="Continue with email"
          disabled={busy !== null}
          onPress={() => router.push('/(auth)/email-sign-up')}
        />
      </View>
    </View>
  );
}
