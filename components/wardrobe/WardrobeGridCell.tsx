import { View } from 'react-native';
import { Image } from 'expo-image';

import { CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.value, option.label])) as Record<
  WardrobeItemCategory,
  string
>;

type Props = {
  category: WardrobeItemCategory;
  name: string | null;
  thumbnailUrl: string | null;
  size: number;
};

/**
 * Not tappable -- item detail/edit/delete is Story 2.4's scope, so this cell
 * is display-only for now (a plain `View`, not `Pressable`). It still gets an
 * `accessibilityLabel` so VoiceOver identifies the item even without an
 * action to take on it.
 */
export function WardrobeGridCell({ category, name, thumbnailUrl, size }: Props) {
  const label = name ? `${name}, ${CATEGORY_LABELS[category]}` : CATEGORY_LABELS[category];

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
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
    </View>
  );
}
