import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import type { BatchItemStatus } from '@/stores/wardrobeCapture';

export type FilmstripShot = {
  id: string;
  photoUri: string;
  status: BatchItemStatus;
};

type Props = {
  shots: FilmstripShot[];
};

const THUMB_SIZE = 64;
const BADGE_SIZE = 24;

/**
 * The rapid-camera view's row of captured shots -- each one shows its own
 * background-removal progress (spinner -> checkmark, or an error mark) as it
 * happens, since processing runs per-shot in the background while the user
 * keeps shooting (not just once at the end). No icon library is used here
 * (the app has none installed -- text-only tab bar, SVG only for required
 * brand marks) -- status is a plain glyph in `Text`, matching that pattern.
 */
export function CameraFilmstrip({ shots }: Props) {
  if (shots.length === 0) {
    return null;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" contentContainerStyle={{ gap: 8 }}>
      {shots.map((shot, index) => (
        <View
          key={shot.id}
          accessible
          accessibilityLabel={`Photo ${index + 1}, ${statusLabel(shot.status)}`}
          style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
        >
          <Image
            source={{ uri: shot.photoUri }}
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            contentFit="cover"
            className="rounded-lg"
          />
          <View
            className="absolute bottom-1 right-1 items-center justify-center rounded-full bg-surface-base dark:bg-surface-baseDark"
            style={{ width: BADGE_SIZE, height: BADGE_SIZE }}
          >
            {shot.status === 'processing' ? <ActivityIndicator size="small" /> : null}
            {shot.status === 'ready' ? (
              <Text
                variant="label"
                className="text-ink-primary dark:text-ink-primaryDark"
                style={{ fontSize: 16, lineHeight: 18 }}
              >
                ✓
              </Text>
            ) : null}
            {shot.status === 'error' ? (
              <Text
                variant="label"
                className="text-destructive dark:text-destructiveDark"
                style={{ fontSize: 16, lineHeight: 18 }}
              >
                !
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function statusLabel(status: BatchItemStatus): string {
  if (status === 'processing') {
    return 'processing';
  }
  if (status === 'error') {
    return 'needs a retake';
  }
  return 'ready';
}
