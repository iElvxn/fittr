import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { useImageAspectRatio } from '@/lib/theme/useImageAspectRatio';

const DEFAULT_ASPECT_RATIO = 3 / 4;

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
 *
 * The name sits below the photo, not overlaid on it -- DESIGN.md's grid
 * cell rule is "no card chrome" on the photography itself, and an overlay
 * pill (even at partial opacity) still sits on top of the image. Matches
 * the caption-below-image treatment seen in Zalando's/Doji's saved-outfit
 * grids rather than a caption baked into the photo.
 */
export function FitsGridCell({ name, thumbnailUrl, columnWidth, onPress }: Props) {
  const { aspectRatio, handleLoad } = useImageAspectRatio(DEFAULT_ASPECT_RATIO);
  const height = columnWidth / aspectRatio;

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
      </View>
      <Text variant="meta" numberOfLines={1} className="mt-1.5 text-ink-secondary dark:text-ink-secondaryDark">
        {name}
      </Text>
    </Pressable>
  );
}
