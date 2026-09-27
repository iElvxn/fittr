import { ActionSheetIOS, Alert, Linking } from 'react-native';

/**
 * Story 5.4's native confirmations, same `ActionSheetIOS` pattern as Fit
 * detail's Delete. Kept apart from `wearPhoto.ts` (the storage seam) since
 * these are UI, not storage.
 */
function confirm(options: { title?: string; action: string }): Promise<boolean> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        ...(options.title ? { title: options.title } : {}),
        options: [options.action, 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (buttonIndex) => resolve(buttonIndex === 0),
    );
  });
}

export function confirmRemoveWearPhoto() {
  return confirm({ action: 'Remove photo' });
}

/** Only asked when today's wear has a photo -- a wear without one still undoes in one tap. */
export function confirmUndoWearWithPhoto() {
  return confirm({ title: "Undo today's wear? Its photo will be deleted.", action: 'Undo wear' });
}

/** A denied camera can only be turned back on in Settings, so say where. */
export function explainCameraDenied() {
  Alert.alert('Camera access is off', 'To take a photo of what you wore, turn on camera access in Settings.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings() },
  ]);
}
