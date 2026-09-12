import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Link, Stack, router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { signUpWithEmail, validateEmailSignUp } from '@/lib/auth/emailSignUp';
import { NO_CONNECTION_MESSAGE, SignUpError } from '@/lib/auth/errors';

export default function EmailSignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setFieldError(null);
    setConnectionError(false);
    setDuplicateEmail(false);

    const validation = validateEmailSignUp(email, password);
    if (validation) {
      setFieldError(validation.message);
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail(email, password);
      // Input stays intact until we know the outcome; on success we leave
      // the screen entirely, so there's nothing further to reset.
      router.replace('/onboarding');
    } catch (error) {
      if (error instanceof SignUpError && error.kind === 'no_connection') {
        setConnectionError(true);
      } else if (error instanceof SignUpError && error.kind === 'duplicate_email') {
        setDuplicateEmail(true);
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
      <Stack.Screen options={{ title: 'Continue with email' }} />
      <View className="flex-1 justify-center px-gutter">
        <Text variant="title" className="mb-6 text-ink-primary dark:text-ink-primaryDark">
          Create your account
        </Text>

        {connectionError ? (
          <View className="mb-4">
            <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
          </View>
        ) : null}

        {duplicateEmail ? (
          <View className="mb-4 rounded-sm border border-border-hairline bg-surface-raised px-4 py-3 dark:border-border-hairlineDark dark:bg-surface-raisedDark">
            <Text variant="body" className="text-ink-primary dark:text-ink-primaryDark">
              Account already exists — sign in instead.
            </Text>
            <Link href="/(auth)/sign-in" replace className="mt-2">
              <Text variant="label" className="text-ink-primary underline dark:text-ink-primaryDark">
                Go to sign in
              </Text>
            </Link>
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
          autoComplete="new-password"
          textContentType="newPassword"
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

        <Button title="Create account" variant="primary" loading={submitting} onPress={handleSubmit} />
      </View>
    </KeyboardAvoidingView>
  );
}
