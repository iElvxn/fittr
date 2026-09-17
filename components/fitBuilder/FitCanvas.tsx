import { View, type LayoutChangeEvent } from 'react-native';
import { useState } from 'react';

import { CanvasItem } from '@/components/fitBuilder/CanvasItem';
import { GhostSlot } from '@/components/fitBuilder/GhostSlot';
import { useFitBuilderStore } from '@/stores/fitBuilder';
import type { WardrobeItemCategory } from '@/lib/wardrobe/addItem';
import { FIT_TEMPLATES, type TemplateSlot } from '@/lib/fitBuilder/templates';
import type { ThumbnailUrlMap } from '@/lib/wardrobe/thumbnailUrls';

/** Cutout render size on the canvas -- independent of the tray's smaller chip thumbnails. */
const CANVAS_ITEM_SIZE = 140;

type Props = {
  cutoutUrls: ThumbnailUrlMap;
  wardrobeItemCutoutPaths: Record<string, string>;
};

/**
 * Full-bleed surface-base canvas. Items are bare cutouts with no card/shadow
 * -- the only selection cue is `CanvasItem`'s 2px outline, applied here based
 * on the store's `selectedId`. Any template category-slot with no placed
 * item yet shows a non-interactive ghost-silhouette "+" placeholder -- the
 * frozen spec's promised visual guidance for what's still unfilled; adding
 * an item for that category (via the tray) still goes through `addItem`'s
 * own slot logic, this is display-only.
 */
export function FitCanvas({ cutoutUrls, wardrobeItemCutoutPaths }: Props) {
  const templateId = useFitBuilderStore((state) => state.templateId);
  const items = useFitBuilderStore((state) => state.items);
  const selectedId = useFitBuilderStore((state) => state.selectedId);
  const selectItem = useFitBuilderStore((state) => state.selectItem);
  const bringToFront = useFitBuilderStore((state) => state.bringToFront);
  const updateItemTransform = useFitBuilderStore((state) => state.updateItemTransform);

  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function handleSelect(id: string) {
    selectItem(id);
    bringToFront(id);
  }

  // A slot at category-index N is still unfilled once fewer than N+1 items of
  // that category exist -- this mirrors `addItem`'s own slot consumption
  // order exactly, so the ghosts shown are precisely the slots not yet used.
  const filledCountByCategory = new Map<WardrobeItemCategory, number>();
  for (const item of items) {
    filledCountByCategory.set(item.category, (filledCountByCategory.get(item.category) ?? 0) + 1);
  }
  const seenIndexByCategory = new Map<WardrobeItemCategory, number>();
  const unfilledSlots: TemplateSlot[] = templateId
    ? FIT_TEMPLATES[templateId]
        .filter((slot) => {
          const seen = seenIndexByCategory.get(slot.category) ?? 0;
          seenIndexByCategory.set(slot.category, seen + 1);
          return seen >= (filledCountByCategory.get(slot.category) ?? 0);
        })
        .sort((a, b) => a.zIndex - b.zIndex)
    : [];

  return (
    <View className="flex-1 bg-surface-base dark:bg-surface-baseDark" onLayout={handleLayout}>
      {size.width > 0 &&
        unfilledSlots.map((slot, index) => (
          <GhostSlot
            key={`${slot.category}-${index}`}
            category={slot.category}
            containerWidth={size.width}
            containerHeight={size.height}
            x={slot.x}
            y={slot.y}
            width={slot.width}
            height={slot.height}
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
    </View>
  );
}
