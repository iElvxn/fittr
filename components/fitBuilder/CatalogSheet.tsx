import { Modal, Pressable, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { CloseIcon } from '@/components/ui/icons/CloseIcon';
import { CategoryFilterChips, type CategoryFilter } from '@/components/wardrobe/CategoryFilterChips';
import { WardrobeGridCell } from '@/components/wardrobe/WardrobeGridCell';
import { CATEGORY_LABELS } from '@/lib/wardrobe/addItem';
import { filterByCategory, type WardrobeItemRow } from '@/lib/wardrobe/listItems';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import { colors } from '@/lib/theme/colors';

const CLOSE_BUTTON_SIZE = 36;
const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const GUTTER = 16;
/** Leaves a dimmed sliver of the canvas visible above the sheet, so the slot being filled stays in view. */
const SHEET_HEIGHT_FRACTION = 0.9;

type Props = {
  visible: boolean;
  /** Filter this sheet opens pre-selected to -- a tapped slot's own category, or 'all' for the unfiltered "Add item" entry point. */
  category: CategoryFilter;
  items: WardrobeItemRow[];
  thumbnailUrls: ThumbnailUrlMap;
  onSelectItem: (item: WardrobeItemRow) => void;
  onClose: () => void;
};

/**
 * A near-full-height catalog picker, opened by tapping a canvas slot's "+".
 * Deliberately plain `Modal` + `animationType="slide"` rather than a
 * Reanimated-driven sheet -- this app's Reanimated version has no working
 * jest mock yet (see `CanvasItem`, untested for the same reason), and the
 * native slide transition already gives the same feel with none of that
 * risk. Callers key this component on `category` so re-opening it for a
 * different slot starts the filter fresh instead of remembering the last one.
 */
export function CatalogSheet({ visible, category, items, thumbnailUrls, onSelectItem, onClose }: Props) {
  const [filter, setFilter] = useState<CategoryFilter>(category);
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();

  const closeButtonColor = scheme === 'dark' ? colors.dark.inkSecondary : colors.light.inkSecondary;
  const cellSize = (width - GUTTER * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  if (!visible) {
    return null;
  }

  const visibleItems = filterByCategory(items, filter);
  const title = filter === 'all' ? 'Add to Fit' : `Add ${CATEGORY_LABELS[filter]}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View
          style={{ height: `${SHEET_HEIGHT_FRACTION * 100}%`, paddingBottom: insets.bottom }}
          className="rounded-t-lg bg-surface-base dark:bg-surface-baseDark"
        >
          <View className="items-center pt-2">
            <View className="h-1 w-9 rounded-full bg-border-hairline dark:bg-border-hairlineDark" />
          </View>
          <View className="flex-row items-center justify-between px-gutter pb-3 pt-2">
            <Text variant="title" className="text-ink-primary dark:text-ink-primaryDark">
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={{ width: CLOSE_BUTTON_SIZE, height: CLOSE_BUTTON_SIZE, borderRadius: CLOSE_BUTTON_SIZE / 2 }}
              className="items-center justify-center border border-border-hairline dark:border-border-hairlineDark"
            >
              <CloseIcon size={16} color={closeButtonColor} />
            </Pressable>
          </View>
          <View className="mb-3">
            <CategoryFilterChips selected={filter} onSelect={setFilter} />
          </View>
          {visibleItems.length === 0 ? (
            <View className="flex-1 items-center justify-center px-gutter">
              <Text variant="body" className="text-center text-ink-secondary dark:text-ink-secondaryDark">
                No items in this category.
              </Text>
            </View>
          ) : (
            <View className="flex-1 flex-row flex-wrap gap-2 px-gutter">
              {visibleItems.map((item) => (
                <WardrobeGridCell
                  key={item.id}
                  category={item.category}
                  name={item.name}
                  thumbnailUrl={thumbnailUrls[item.thumb_path] ?? null}
                  size={cellSize}
                  onPress={() => onSelectItem(item)}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
