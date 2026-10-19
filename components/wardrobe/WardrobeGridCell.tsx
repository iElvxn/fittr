import { Pressable, View } from 'react-native';

import { StorageImage } from '@/components/ui/StorageImage';
import { CATEGORY_LABELS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

type Props = {
  category: WardrobeItemCategory;
  name: string | null;
  thumbnailUrl: string | null;
  /** Storage path `thumbnailUrl` was signed for -- the image's cache key. */
  thumbnailPath: string;
  size: number;
  onPress: () => void;
};

/** Tappable -- navigates to the item detail screen (Story 2.4). */
export function WardrobeGridCell({ category, name, thumbnailUrl, thumbnailPath, size, onPress }: Props) {
  const label = name ? `${name}, ${CATEGORY_LABELS[category]}` : CATEGORY_LABELS[category];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: size, height: size }}
      className="active:opacity-70"
    >
      {thumbnailUrl ? (
        <StorageImage
          testID="wardrobe-thumbnail-image"
          path={thumbnailPath}
          url={thumbnailUrl}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      ) : (
        <View testID="wardrobe-thumbnail-fallback" className="h-full w-full rounded-lg bg-surface-raised dark:bg-surface-raisedDark" />
      )}
    </Pressable>
  );
}
