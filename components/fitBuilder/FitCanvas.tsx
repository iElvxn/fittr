import { Pressable, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import { useState } from 'react';

import { CanvasItem } from '@/components/fitBuilder/CanvasItem';
import { GhostSlot } from '@/components/fitBuilder/GhostSlot';
import { TrashIcon } from '@/components/ui/icons/TrashIcon';
import { useFitBuilderStore } from '@/stores/fitBuilder';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { FIT_TEMPLATES, type TemplateSlot } from '@/lib/fitBuilder/templates';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';
import { colors } from '@/lib/theme/colors';

/** Cutout render size on the canvas -- independent of the tray's smaller chip thumbnails. */
const CANVAS_ITEM_SIZE = 190;
const DELETE_BUTTON_SIZE = 44;
const CANVAS_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

type Props = {
  cutoutUrls: ThumbnailUrlMap;
  wardrobeItemCutoutPaths: Record<string, string>;
  /** Opens the catalog sheet pre-filtered to the tapped ghost slot's own index and category. */
  onSlotPress: (templateSlotIndex: number, category: WardrobeItemCategory) => void;
};

/**
 * The canvas renders as an inset, rounded, shadowed card floating on the
 * screen's own background -- distinguishes the working surface from the
 * chrome around it. Items are bare cutouts with no card/shadow of their own
 * -- the only selection cue is `CanvasItem`'s 2px outline, applied here based
 * on the store's `selectedId`. Any template category-slot with no placed
 * item yet shows a ghost-silhouette "+" placeholder -- tapping its badge
 * calls `onSlotPress` to open the catalog sheet pre-filtered to that
 * category; the actual placement still goes through the caller's own
 * `addItem` call once something is picked.
 */
export function FitCanvas({ cutoutUrls, wardrobeItemCutoutPaths, onSlotPress }: Props) {
  const templateId = useFitBuilderStore((state) => state.templateId);
  const items = useFitBuilderStore((state) => state.items);
  const selectedId = useFitBuilderStore((state) => state.selectedId);
  const selectItem = useFitBuilderStore((state) => state.selectItem);
  const bringToFront = useFitBuilderStore((state) => state.bringToFront);
  const updateItemTransform = useFitBuilderStore((state) => state.updateItemTransform);
  const removeItem = useFitBuilderStore((state) => state.removeItem);
  const scheme = useColorScheme();

  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function handleSelect(id: string) {
    selectItem(id);
    bringToFront(id);
  }

  // A template slot is unfilled exactly when no placed item's own
  // `templateSlotIndex` claims it -- identity, not a per-category count, so
  // whichever specific ghost was tapped (and filled) is the one that
  // disappears, even out of template order (e.g. the second of two
  // Accessories slots, filled before the first).
  const claimedSlotIndexes = new Set(
    items.map((item) => item.templateSlotIndex).filter((index): index is number => index !== null),
  );
  const unfilledSlots: { slot: TemplateSlot; index: number }[] = templateId
    ? FIT_TEMPLATES[templateId]
        .map((slot, index) => ({ slot, index }))
        .filter(({ index }) => !claimedSlotIndexes.has(index))
        .sort((a, b) => a.slot.zIndex - b.slot.zIndex)
    : [];

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const deleteButtonColor = scheme === 'dark' ? colors.dark.inkSecondary : colors.light.inkSecondary;

  return (
    <View className="flex-1 bg-surface-base px-gutter pt-4 pb-3 dark:bg-surface-baseDark">
      <View
        testID="fit-canvas"
        className="flex-1 overflow-hidden rounded-lg bg-surface-raised dark:bg-surface-raisedDark"
        style={CANVAS_SHADOW}
        onLayout={handleLayout}
      >
        {size.width > 0 &&
          unfilledSlots.map(({ slot, index }) => (
            <GhostSlot
              key={index}
              category={slot.category}
              containerWidth={size.width}
              containerHeight={size.height}
              x={slot.x}
              y={slot.y}
              width={slot.width}
              height={slot.height}
              onPress={() => onSlotPress(index, slot.category)}
            />
          ))}
        {size.width > 0 &&
          items.map((item) => {
            const cutoutPath = wardrobeItemCutoutPaths[item.wardrobeItemId];
            const imageUrl = cutoutPath ? (cutoutUrls[cutoutPath] ?? null) : null;
            return (
              <CanvasItem
                key={item.id}
                item={item}
                imageUrl={imageUrl}
                canvasWidth={size.width}
                canvasHeight={size.height}
                itemSize={CANVAS_ITEM_SIZE}
                isSelected={item.id === selectedId}
                onSelect={() => handleSelect(item.id)}
                onTransformEnd={(transform) => updateItemTransform(item.id, transform)}
              />
            );
          })}
        {selectedItem ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete item"
            onPress={() => removeItem(selectedItem.id)}
            hitSlop={8}
            style={{
              position: 'absolute',
              bottom: 12,
              alignSelf: 'center',
              width: DELETE_BUTTON_SIZE,
              height: DELETE_BUTTON_SIZE,
              borderRadius: DELETE_BUTTON_SIZE / 2,
              shadowColor: '#000',
              shadowOpacity: 0.1,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }}
            className="items-center justify-center border border-border-hairline bg-surface-raised dark:border-border-hairlineDark dark:bg-surface-raisedDark"
          >
            <TrashIcon size={18} color={deleteButtonColor} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
