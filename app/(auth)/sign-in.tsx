import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/app/(auth)/components/ConnectionErrorNotice';
import { signInWithEmail } from '@/lib/auth/emailSignIn';
import { INVALID_CREDENTIALS_MESSAGE, NO_CONNECTION_MESSAGE, SignUpError } from '@/lib/auth/errors';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setFieldError(null);
    setConnectionError(false);

    if (!email.trim() || !password) {
      setFieldError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      // Input stays intact until we know the outcome; on success we leave
      // the screen entirely, so there's nothing further to reset.
      router.replace('/(tabs)/index');
    } catch (error) {
      if (error instanceof SignUpError && error.kind === 'no_connection') {
        setConnectionError(true);
      } else if (error instanceof SignUpError && error.kind === 'invalid_credentials') {
        setFieldError(INVALID_CREDENTIALS_MESSAGE);
      } else {
        setFieldError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-base dark:bg-surface-baseDark"
    >
      <Stack.Screen options={{ title: 'Sign in' }} />
      <View className="flex-1 justify-center px-gutter">
        <Text variant="title" className="mb-6 text-ink-primary dark:text-ink-primaryDark">
          Welcome back
        </Text>

        {connectionError ? (
          <View className="mb-4">
            <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
          </View>
        ) : null}

        <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
          Email
        </Text>
        <TextInput
          testID="email-input"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email"
          className="mb-4 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
        />

        <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
          Password
        </Text>
        <TextInput
          testID="password-input"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          accessibilityLabel="Password"
          className="mb-2 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
        />

        {fieldError ? (
          <Text variant="meta" className="mb-4 text-destructive dark:text-destructiveDark">
            {fieldError}
          </Text>
        ) : (
          <View className="mb-4" />
        )}

        <Button title="Sign in" variant="primary" loading={submitting} onPress={handleSubmit} />
      </View>
    </KeyboardAvoidingView>
  );
}
