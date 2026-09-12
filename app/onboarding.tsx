import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { useSession } from '@/lib/auth/useSession';
import { validateDisplayName } from '@/lib/profile/validation';
import { pickAvatar, uploadAvatar } from '@/lib/profile/avatar';
import { updateProfile } from '@/lib/profile/updateProfile';
import { NO_CONNECTION_MESSAGE, SignUpError } from '@/lib/auth/errors';

const AVATAR_SIZE = 96;

export default function Onboarding() {
  const { session } = useSession();
  const userId = session?.user.id;

  const [displayName, setDisplayName] = useState('');
  // Picking only stages a local file for preview -- nothing is uploaded
  // until Continue is pressed, since the avatar's fixed-filename `upsert`
  // overwrite can't be undone once it happens.
  const [pickedAvatarUri, setPickedAvatarUri] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePickAvatar() {
    try {
      const picked = await pickAvatar();
      if ('cancelled' in picked) {
        return;
      }
      setPickedAvatarUri(picked.uri);
    } catch {
      setFieldError('Something went wrong. Please try again.');
    }
  }

  async function handleContinue() {
    if (!userId) {
      return;
    }

    setFieldError(null);
    setConnectionError(false);

    const validation = validateDisplayName(displayName);
    if (validation) {
      setFieldError(validation.message);
      return;
    }

    setSubmitting(true);
    try {
      const avatarPath = pickedAvatarUri ? await uploadAvatar(userId, pickedAvatarUri) : undefined;
      await updateProfile(userId, { displayName, avatarPath });
      router.replace('/(tabs)');
    } catch (error) {
      if (error instanceof SignUpError && error.kind === 'no_connection') {
        setConnectionError(true);
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
      <View className="flex-1 justify-center px-gutter">
        <Text variant="display" className="mb-2 text-ink-primary dark:text-ink-primaryDark">
          Welcome to Fittr
        </Text>
        <Text variant="body" className="mb-6 text-ink-secondary dark:text-ink-secondaryDark">
          Set a display name so your account reflects who you are.
        </Text>

        {connectionError ? (
          <View className="mb-4">
            <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
          </View>
        ) : null}

        <View className="mb-6 items-center">
          {pickedAvatarUri ? (
            <Image
              testID="avatar-preview"
              accessibilityLabel="Profile avatar"
              source={{ uri: pickedAvatarUri }}
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
            />
          ) : (
            <View
              className="border border-border-hairline dark:border-border-hairlineDark"
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
            />
          )}
          <View className="mt-3 w-full">
            <Button
              title={pickedAvatarUri ? 'Change photo' : 'Add a photo'}
              onPress={handlePickAvatar}
            />
          </View>
        </View>

        <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
          Display name
        </Text>
        <TextInput
          testID="display-name-input"
          value={displayName}
          onChangeText={setDisplayName}
          accessibilityLabel="Display name"
          className="mb-2 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
        />

        {fieldError ? (
          <Text variant="meta" className="mb-4 text-destructive dark:text-destructiveDark">
            {fieldError}
          </Text>
        ) : (
          <View className="mb-4" />
        )}

        <Button title="Continue" variant="primary" loading={submitting} onPress={handleContinue} />
      </View>
    </KeyboardAvoidingView>
  );
}
