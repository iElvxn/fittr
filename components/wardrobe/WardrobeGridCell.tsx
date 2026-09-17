import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { CATEGORY_LABELS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

type Props = {
  category: WardrobeItemCategory;
  name: string | null;
  thumbnailUrl: string | null;
  size: number;
  onPress: () => void;
};

/** Tappable -- navigates to the item detail screen (Story 2.4). */
export function WardrobeGridCell({ category, name, thumbnailUrl, size, onPress }: Props) {
  const label = name ? `${name}, ${CATEGORY_LABELS[category]}` : CATEGORY_LABELS[category];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: size, height: size }}
    >
      {thumbnailUrl ? (
        <Image
          testID="wardrobe-thumbnail-image"
          source={{ uri: thumbnailUrl }}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      ) : (
        <View testID="wardrobe-thumbnail-fallback" className="h-full w-full rounded-sm bg-surface-raised dark:bg-surface-raisedDark" />
      )}
    </Pressable>
  );
}
