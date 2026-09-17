import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '@/components/ui/Text';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, type WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import type { WardrobeItemRow } from '@/lib/wardrobe/listItems';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';

const CHIP_SIZE = 60;
const TRAY_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: -3 },
  elevation: 4,
};

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
    <View
      style={TRAY_SHADOW}
      className="rounded-t-lg border-t border-border-hairline bg-surface-raised pt-3 dark:border-border-hairlineDark dark:bg-surface-raisedDark"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row gap-2 px-gutter pb-3"
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
                'rounded-full border px-4 py-2',
                isActive
                  ? 'border-accent bg-accent dark:border-accentDark dark:bg-accentDark'
                  : 'border-border-hairline bg-transparent dark:border-border-hairlineDark',
              ].join(' ')}
            >
              <Text
                variant="label"
                className={isActive ? 'text-surface-raised' : 'text-ink-secondary dark:text-ink-secondaryDark'}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ height: CHIP_SIZE + 24 }} className="border-t border-border-hairline dark:border-border-hairlineDark">
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
            contentContainerClassName="flex-row gap-3 px-gutter pt-3"
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
                  className="overflow-hidden rounded-md border border-border-hairline bg-surface-base dark:border-border-hairlineDark dark:bg-surface-baseDark"
                >
                  {thumbnailUrl ? (
                    <Image
                      source={{ uri: thumbnailUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
