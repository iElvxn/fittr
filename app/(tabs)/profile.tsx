import { useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/auth/useSession';
import { NO_CONNECTION_MESSAGE, SignUpError } from '@/lib/auth/errors';
import { validateDisplayName } from '@/lib/profile/validation';
import { pickAvatar, uploadAvatar } from '@/lib/profile/avatar';
import { updateProfile } from '@/lib/profile/updateProfile';
import { useAvatarUrl } from '@/lib/profile/avatarUrl';

const AVATAR_SIZE = 96;

export default function Profile() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_path')
        .eq('id', userId as string)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: Boolean(userId),
  });

  const { data: avatarUrl } = useAvatarUrl(profile?.avatar_path);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  // Picking only stages a local file for preview -- nothing is uploaded
  // until Save is pressed, since the avatar's fixed-filename `upsert`
  // overwrite can't be undone once it happens (Cancel must be a true no-op).
  const [pickedAvatarUri, setPickedAvatarUri] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetEditState() {
    setPickedAvatarUri(null);
    setFieldError(null);
    setConnectionError(false);
  }

  function handleStartEdit() {
    setEditName(profile?.display_name ?? '');
    resetEditState();
    setIsEditing(true);
  }

  function handleCancelEdit() {
    resetEditState();
    setIsEditing(false);
  }

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

  async function handleSave() {
    if (!userId) {
      return;
    }

    setFieldError(null);
    setConnectionError(false);

    const validation = validateDisplayName(editName);
    if (validation) {
      setFieldError(validation.message);
      return;
    }

    setSaving(true);
    try {
      const avatarPath = pickedAvatarUri ? await uploadAvatar(userId, pickedAvatarUri) : undefined;
      await updateProfile(userId, { displayName: editName, avatarPath });
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      if (avatarPath) {
        await queryClient.invalidateQueries({ queryKey: ['avatarUrl', avatarPath] });
      }
      resetEditState();
      setIsEditing(false);
    } catch (error) {
      if (error instanceof SignUpError && error.kind === 'no_connection') {
        setConnectionError(true);
      } else {
        setFieldError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/welcome');
  }

  const displayedAvatarUri = pickedAvatarUri ?? avatarUrl ?? null;

  return (
    <View className="flex-1 justify-between bg-surface-base px-gutter py-10 dark:bg-surface-baseDark">
      <View className="items-center pt-10">
        {isLoading ? (
          <ActivityIndicator />
        ) : isError ? (
          <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
        ) : (
          <>
            {connectionError ? (
              <View className="mb-4 w-full">
                <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
              </View>
            ) : null}

            {displayedAvatarUri ? (
              <Image
                testID="avatar-preview"
                accessibilityLabel="Profile avatar"
                source={{ uri: displayedAvatarUri }}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
              />
            ) : (
              <View
                className="border border-border-hairline dark:border-border-hairlineDark"
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
              />
            )}

            {isEditing ? (
              <View className="mt-4 w-full">
                <View className="mb-4">
                  <Button title="Change photo" onPress={handlePickAvatar} />
                </View>

                <Text variant="label" className="mb-1 text-ink-secondary dark:text-ink-secondaryDark">
                  Display name
                </Text>
                <TextInput
                  testID="display-name-input"
                  value={editName}
                  onChangeText={setEditName}
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

                <View className="mb-2">
                  <Button title="Save" variant="primary" loading={saving} onPress={handleSave} />
                </View>
                <Button title="Cancel" onPress={handleCancelEdit} />
              </View>
            ) : (
              <View className="mt-4 w-full items-center">
                <Text variant="title" className="mb-4 text-ink-primary dark:text-ink-primaryDark">
                  {profile?.display_name}
                </Text>
                <Button title="Edit" onPress={handleStartEdit} />
              </View>
            )}
          </>
        )}
      </View>

      {isEditing ? null : <Button title="Sign Out" onPress={handleSignOut} />}
    </View>
  );
}
