import { useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ConnectionErrorNotice } from '@/components/ConnectionErrorNotice';
import { NO_CONNECTION_MESSAGE } from '@/lib/fits/errors';

type Props = {
  visible: boolean;
  collageUri: string;
  /** Generated "Fit {n}" name, pre-filled and used as the fallback for a blank edit. */
  defaultName: string;
  saving: boolean;
  connectionError: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
};

/**
 * Reached from the canvas's Save action. Same Modal/backdrop/drag-handle
 * chrome as `CanvasBackgroundSheet` so the builder's sheet family stays
 * visually consistent. The name field starts pre-filled with the generated
 * default -- accepting it as-is, or clearing it entirely, both save under
 * that same default, since a Fit's name is never actually blank.
 */
export function SaveFitSheet({ visible, collageUri, defaultName, saving, connectionError, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(defaultName);

  if (!visible) {
    return null;
  }

  function handleSave() {
    onSave(name.trim() || defaultName);
  }

  // Dismissing mid-save would orphan the in-flight `uploadCover`/`insertFit`
  // call: its eventual success would silently navigate the user away with no
  // action from them, and a failure would set `connectionError` on a sheet
  // that's already gone, so the block-and-keep retry state is never seen.
  // `onRequestClose` stays a real (no-op) function rather than `undefined`
  // while saving -- Android only intercepts the hardware back button when
  // this prop is set, so leaving it `undefined` would let back bubble past
  // the sheet and out of the screen entirely instead of just being ignored.
  function handleClose() {
    if (!saving) {
      onClose();
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={handleClose}
          disabled={saving}
          className="absolute inset-0 bg-black/40"
        />
        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="rounded-t-lg bg-surface-base px-gutter pt-2 dark:bg-surface-baseDark"
        >
          <View className="items-center pb-3 pt-2">
            <View className="h-1 w-9 rounded-full bg-border-hairline dark:bg-border-hairlineDark" />
          </View>
          <Text variant="title" className="mb-4 text-ink-primary dark:text-ink-primaryDark">
            Save Fit
          </Text>
          <Image
            testID="save-fit-collage"
            source={{ uri: collageUri }}
            style={{ width: '100%', aspectRatio: 1, borderRadius: 8 }}
            contentFit="cover"
            accessibilityLabel="Fit preview"
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={defaultName}
            accessibilityLabel="Fit name"
            className="mb-3 mt-4 rounded-sm border border-border-hairline px-4 py-3 font-[Montserrat_400Regular] text-ink-primary dark:border-border-hairlineDark dark:text-ink-primaryDark"
          />
          {connectionError ? (
            <View className="mb-3">
              <ConnectionErrorNotice message={NO_CONNECTION_MESSAGE} />
            </View>
          ) : null}
          <Button
            title="Save"
            variant="primary"
            loading={saving}
            onPress={handleSave}
            accessibilityLabel="Save"
          />
        </View>
      </View>
    </Modal>
  );
}
