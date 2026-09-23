import { useMemo } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CATEGORY_LABELS } from '@/lib/wardrobe/addItem';
import { useThumbnailUrls } from '@/lib/wardrobe/thumbnailUrls';
import type { FitItemPlacementWithSource } from '@/lib/fits/getFitItems';

const THUMBNAIL_SIZE = 44;

type Props = {
  items: FitItemPlacementWithSource[];
};

/**
 * Static list, not tappable -- Story 4.1's AC only calls for seeing the item
 * list on Fit detail, not navigating from it. A deleted-source row still
 * shows its last-known name/thumbnail, muted, with a "Removed" tag -- same
 * "recovered, not guessed" treatment as the canvas gap (Story 3.4), applied
 * here instead of the empty/blank row a stale item_id would otherwise imply.
 */
export function FitItemsList({ items }: Props) {
  const thumbPaths = useMemo(
    () => items.map((item) => item.thumbPath).filter((path): path is string => Boolean(path)),
    [items],
  );
  const { data: thumbnailUrls } = useThumbnailUrls(thumbPaths);

  if (items.length === 0) {
    return null;
  }

  return (
    <View testID="fit-items-list">
      {items.map((item) => {
        const thumbnailUrl = item.thumbPath ? (thumbnailUrls?.[item.thumbPath] ?? null) : null;
        // When there's no name, the primary label already falls back to the
        // category -- the meta line below must not repeat it, or a nameless
        // item shows the same word stacked twice.
        const label = item.name ?? CATEGORY_LABELS[item.category];
        const metaText = item.wardrobeItemDeleted ? 'Removed' : item.name ? CATEGORY_LABELS[item.category] : null;

        return (
          <View key={item.id} className="flex-row items-center gap-3 border-b border-border-hairline py-3 dark:border-border-hairlineDark">
            <View
              style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
              className={['overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark', item.wardrobeItemDeleted ? 'opacity-40' : ''].join(' ')}
            >
              {thumbnailUrl ? (
                <Image
                  testID="fit-items-list-thumbnail"
                  accessibilityLabel=""
                  source={{ uri: thumbnailUrl }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              ) : null}
            </View>
            <View className="flex-1">
              <Text
                variant="body"
                numberOfLines={1}
                className={item.wardrobeItemDeleted ? 'text-ink-disabled dark:text-ink-disabledDark' : 'text-ink-primary dark:text-ink-primaryDark'}
              >
                {label}
              </Text>
              {metaText ? (
                <Text variant="meta" className="text-ink-secondary dark:text-ink-secondaryDark">
                  {metaText}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
