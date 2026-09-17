import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import type { WardrobeItemRow } from '@/lib/wardrobe/listItems';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';

const CHIP_SIZE = 60;

type Props = {
  items: WardrobeItemRow[];
  thumbnailUrls: ThumbnailUrlMap;
  onAddItem: (item: WardrobeItemRow) => void;
};

/**
 * Category chips reuse `CategoryFilterChips`' fill-vs-outline selected
 * treatment; the row below shows that category's items as tappable chips --
 * tapping one adds it to the canvas via the caller's `onAddItem`.
 */
export function CategoryTray({ items, thumbnailUrls, onAddItem }: Props) {
  const [activeCategory, setActiveCategory] = useState<WardrobeItemCategory>(CATEGORY_OPTIONS[0].value);

  const itemsInCategory = items.filter((item) => item.category === activeCategory);

  return (
    <View className="border-t border-border-hairline dark:border-border-hairlineDark">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row gap-2 px-gutter py-2"
      >
        {CATEGORY_OPTIONS.map((option) => {
          const isActive = option.value === activeCategory;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveCategory(option.value)}
              hitSlop={8}
              className={[
                'rounded-sm border px-4 py-2',
                isActive
                  ? 'border-ink-primary bg-ink-primary dark:border-ink-primaryDark dark:bg-ink-primaryDark'
                  : 'border-border-hairline bg-transparent dark:border-border-hairlineDark',
              ].join(' ')}
            >
              <Text
                variant="label"
                className={
                  isActive
                    ? 'text-surface-raised dark:text-surface-baseDark'
                    : 'text-ink-secondary dark:text-ink-secondaryDark'
                }
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ height: CHIP_SIZE + 16 }}>
        {itemsInCategory.length === 0 ? (
          <View className="flex-1 items-center justify-center px-gutter">
            <Text variant="meta" className="text-ink-secondary dark:text-ink-secondaryDark">
              No items in this category.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="flex-row gap-2 px-gutter"
          >
            {itemsInCategory.map((item, index) => {
              const thumbnailUrl = thumbnailUrls[item.thumb_path] ?? null;
              // `name` is optional (Epic 2), so unnamed items need a label
              // that still distinguishes them from one another for VoiceOver
              // -- falling back to a bare category label would give every
              // unnamed item in this row the identical announcement.
              const label = item.name ?? `${CATEGORY_LABELS[item.category]} ${index + 1}`;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => onAddItem(item)}
                  style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
                >
                  {thumbnailUrl ? (
                    <Image
                      source={{ uri: thumbnailUrl }}
                      style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
                      contentFit="contain"
                    />
                  ) : (
                    <View className="h-full w-full rounded-sm bg-surface-raised dark:bg-surface-raisedDark" />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
