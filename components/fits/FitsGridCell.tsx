import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';

import { Text } from '@/components/ui/Text';

const DEFAULT_ASPECT_RATIO = 3 / 4;
const LABEL_INSET = 8;

type Props = {
  name: string;
  thumbnailUrl: string | null;
  columnWidth: number;
  onPress: () => void;
};

/**
 * Fit covers aren't captured at a fixed size and the app doesn't persist
 * their dimensions, so height starts at a portrait guess and settles to the
 * cover's real aspect ratio once the image reports its own size -- that's
 * what gives the columns their uneven, Pinterest-board look instead of
 * forcing every cover into a square crop.
 */
export function FitsGridCell({ name, thumbnailUrl, columnWidth, onPress }: Props) {
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const height = columnWidth / aspectRatio;

  function handleLoad(event: ImageLoadEventData) {
    const { width, height: sourceHeight } = event.source;
    if (width > 0 && sourceHeight > 0) {
      setAspectRatio(width / sourceHeight);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={{ width: columnWidth }}
      className="active:opacity-80"
    >
      <View
        style={{ width: columnWidth, height }}
        className="overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-baseDark"
      >
        {thumbnailUrl ? (
          <Image
            testID="fits-grid-thumbnail-image"
            accessibilityLabel=""
            source={{ uri: thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            onLoad={handleLoad}
          />
        ) : (
          <View testID="fits-grid-thumbnail-fallback" className="h-full w-full bg-surface-raised dark:bg-surface-baseDark" />
        )}
        <View pointerEvents="none" style={{ paddingHorizontal: LABEL_INSET }} className="absolute inset-x-0 bottom-2 items-center">
          <View
            style={{ maxWidth: columnWidth - LABEL_INSET * 2 }}
            className="rounded-sm bg-surface-raised/70 px-2 py-0.5 dark:bg-surface-baseDark/70"
          >
            <Text variant="meta" numberOfLines={1} className="text-ink-secondary dark:text-ink-secondaryDark">
              {name}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
